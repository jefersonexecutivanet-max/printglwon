// Simple Web Audio API Synthesizer to emit premium notification chimes sans external mp3 files
export function playAlertChime(type: "critical" | "success" | "info" = "info") {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    
    // Create oscillator and gain node
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === "critical") {
      // High-to-low warning siren pattern
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.15); // A4
      
      gainNode.gain.setValueAtTime(0.15, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc.start(now);
      osc.stop(now + 0.3);

      // Sibling tone for double alert sound
      setTimeout(() => {
        try {
          const ctx2 = new AudioContextClass();
          const osc2 = ctx2.createOscillator();
          const gainNode2 = ctx2.createGain();
          osc2.connect(gainNode2);
          gainNode2.connect(ctx2.destination);
          
          osc2.type = "sine";
          osc2.frequency.setValueAtTime(880, ctx2.currentTime);
          osc2.frequency.exponentialRampToValueAtTime(440, ctx2.currentTime + 0.15);
          
          gainNode2.gain.setValueAtTime(0.15, ctx2.currentTime);
          gainNode2.gain.exponentialRampToValueAtTime(0.01, ctx2.currentTime + 0.3);
          
          osc2.start(ctx2.currentTime);
          osc2.stop(ctx2.currentTime + 0.3);
        } catch (e) {}
      }, 150);

    } else if (type === "success") {
      // Light rising chime
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
      
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

      osc.start(now);
      osc.stop(now + 0.45);
    } else {
      // Soft gentle chime
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.2); // A5
      
      gainNode.gain.setValueAtTime(0.08, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (error) {
    console.warn("Audio context not allowed by browser autoplay policy yet.", error);
  }
}
