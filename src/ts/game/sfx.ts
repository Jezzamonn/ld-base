// @ts-ignore: jsfxr has no type declarations.
import { sfxr } from "jsfxr";
import { MuteState, Sounds } from "../lib/sounds";

const sfx = {
    land: {
        oldParams: true,
        wave_type: 0,
        p_env_attack: 0,
        p_env_sustain: 0.010171919252742523,
        p_env_punch: 0,
        p_env_decay: 0.18206130467654957,
        p_base_freq: 0.5422948751086346,
        p_freq_limit: 0,
        p_freq_ramp: -0.6603650387694955,
        p_freq_dramp: 0,
        p_vib_strength: 0,
        p_vib_speed: 0,
        p_arp_mod: 0,
        p_arp_speed: 0,
        p_duty: 0.5496316985887535,
        p_duty_ramp: 0,
        p_repeat_speed: 0,
        p_pha_offset: 0,
        p_pha_ramp: 0,
        p_lpf_freq: 1,
        p_lpf_ramp: 0,
        p_lpf_resonance: 0,
        p_hpf_freq: 0.027571379671559426,
        p_hpf_ramp: 0,
        sound_vol: 0.08,
        sample_rate: 44100,
        sample_size: 8,
    },
    jump: {
        oldParams: true,
        wave_type: 0,
        p_env_attack: 0,
        p_env_sustain: 0.010171919252742523,
        p_env_punch: 0,
        p_env_decay: 0.18206130467654957,
        p_base_freq: 0.555,
        p_freq_limit: 0,
        p_freq_ramp: -0.6603650387694955,
        p_freq_dramp: 0,
        p_vib_strength: 0,
        p_vib_speed: 0,
        p_arp_mod: 0,
        p_arp_speed: 0,
        p_duty: 0.5496316985887535,
        p_duty_ramp: 0,
        p_repeat_speed: 0,
        p_pha_offset: 0,
        p_pha_ramp: 0,
        p_lpf_freq: 1,
        p_lpf_ramp: 0,
        p_lpf_resonance: 0,
        p_hpf_freq: 0.783,
        p_hpf_ramp: 0,
        sound_vol: 0.05,
        sample_rate: 44100,
        sample_size: 8,
    },
};

class _SFX {
    sounds: { [key: string]: any } = {};

    preload() {
        for (let key in sfx) {
            this.sounds[key] = sfxr.toAudio(sfx[key as keyof typeof sfx]);
        }
    }

    play(name: string) {
        if (Sounds.muteState === MuteState.ALL_OFF) {
            return;
        }

        const sound = this.sounds[name];
        if (sound) {
            sound.play();
        }
    }
}

export const SFX = new _SFX();
