/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * exam.co Audio Notification Service
 * Manages teacher alert sounds with:
 * - LocalStorage sound mute/unmute preference
 * - Incident ID deduplication (never plays twice for same incident)
 * - Rate-limiting throttle to prevent audio storms
 * - Zero sounds during component render or heartbeats
 */

const SOUND_PREF_KEY = 'examco_teacher_sound_enabled';

class AudioNotificationService {
  private isMuted: boolean;
  private seenIncidentIds: Set<string> = new Set();
  private lastPlayedTimestamp = 0;
  private minIntervalMs = 2500; // Minimum 2.5 seconds between sounds to prevent audio spam

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SOUND_PREF_KEY);
      // Default to sound enabled unless explicitly muted
      this.isMuted = saved === 'false';
    } else {
      this.isMuted = false;
    }
  }

  public getSoundEnabled(): boolean {
    return !this.isMuted;
  }

  public setSoundEnabled(enabled: boolean): void {
    this.isMuted = !enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem(SOUND_PREF_KEY, enabled ? 'true' : 'false');
    }
  }

  public toggleSound(): boolean {
    const newState = !this.getSoundEnabled();
    this.setSoundEnabled(newState);
    return newState;
  }

  /**
   * Seed known historical incident IDs so they never trigger audio alerts when
   * reconnecting or refreshing the dashboard.
   */
  public seedKnownIncidents(ids: string[]): void {
    ids.forEach((id) => {
      if (id) this.seenIncidentIds.add(id);
    });
  }

  /**
   * Plays alert chime ONLY for a genuinely new incident that has not been heard yet.
   */
  public playIncidentAlert(incidentId?: string): boolean {
    if (this.isMuted) return false;

    // Deduplicate by incident ID
    if (incidentId) {
      if (this.seenIncidentIds.has(incidentId)) {
        return false; // Already announced
      }
      this.seenIncidentIds.add(incidentId);
    }

    // Rate-limit throttle to prevent audio pile-up
    const now = Date.now();
    if (now - this.lastPlayedTimestamp < this.minIntervalMs) {
      return false;
    }
    this.lastPlayedTimestamp = now;

    this.synthesizeChime();
    return true;
  }

  private synthesizeChime(): void {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc1.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15); // E6

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(440, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.4);
      osc2.stop(ctx.currentTime + 0.4);

      // Clean up AudioContext after sound finishes
      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 500);
    } catch {
      // Audio playback might be restricted by browser until user interacts
    }
  }
}

export const audioNotificationService = new AudioNotificationService();

// Standalone function for compatibility
export function playThreatAlertChime(incidentId?: string) {
  audioNotificationService.playIncidentAlert(incidentId);
}
