import { lerp } from "./util";

interface SoundInfo {
    audio?: HTMLAudioElement;
    subtitles?: string[];
    loaded: boolean;
    loadPromise?: Promise<void>;
}

export enum MuteState {
    PLAY_ALL = 0,
    MUSIC_OFF = 1,
    ALL_OFF = 2,
}

// Playing at 1 volume is too loud.
const VOLUME_MULTIPLE = 0.5;

class _Sounds {
    audios: {[key: string]: SoundInfo} = {};

    curSong?: HTMLAudioElement;
    curSongName?: string;
    muteState = MuteState.PLAY_ALL;

    playbackRate = 1;
    volume = 1;
    songVolumeMultiplier = 1;
    songVolumeTarget = 1;

    setSongVolumeTarget(target: number) {
        this.songVolumeTarget = target;
    }

    update(dt: number) {
        if (this.songVolumeMultiplier !== this.songVolumeTarget) {
            const updateAmt = 1 - Math.exp(-3 * dt); // Smoothly transition volume
            this.songVolumeMultiplier = lerp(this.songVolumeMultiplier, this.songVolumeTarget, updateAmt);
            
            // Snap if very close
            if (Math.abs(this.songVolumeMultiplier - this.songVolumeTarget) < 0.01) {
                this.songVolumeMultiplier = this.songVolumeTarget;
            }

            if (this.curSong != null) {
                this.curSong.volume = this.volume * VOLUME_MULTIPLE * this.songVolumeMultiplier;
            }
        }
    }

    setSongVolumeMultiplier(multiplier: number) {
        this.songVolumeMultiplier = multiplier;
        this.songVolumeTarget = multiplier;
        if (this.curSong != null) {
            this.curSong.volume = this.volume * VOLUME_MULTIPLE * this.songVolumeMultiplier;
        }
    }

    /**
     * Asynchronously fetches an audio.
     */
    loadSound({name, path} : {name: string, path: string}) {
        if (this.audios.hasOwnProperty(name)) {
            throw new Error(`Already loaded sound ${name}.`);
        }

        if (!path.endsWith('/')) {
            path = path + '/';
        }
        const audioPath = `${path}${name}.mp3`;
        const txtPath = `${path}${name}.txt`;

        const info: SoundInfo = {
            loaded: false,
            audio: undefined,
        };
        this.audios[name] = info;

        const promise = new Promise<void>(async (resolve) => {
            const audio = new Audio();
            audio.oncanplaythrough = () => {
                info.audio = audio;
            };
            audio.onerror = () => {
                // Instead of throwing, we just resolve so the game can still run.
                resolve();
            };
            audio.src = audioPath;

            // Load subtitle if it exists
            try {
                const response = await fetch(txtPath);
                if (response.ok) {
                    const text = await response.text();
                    info.subtitles = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
                }
            } catch (e) {
                // Ignore subtitle loading errors
            }

            // Wait for audio to be ready if it's not already
            if (!info.audio) {
                await new Promise<void>((r) => {
                    const onReady = () => {
                        audio.removeEventListener('canplaythrough', onReady);
                        audio.removeEventListener('error', onReady);
                        r();
                    };
                    audio.addEventListener('canplaythrough', onReady);
                    audio.addEventListener('error', onReady);
                });
            }

            info.loaded = true;
            resolve();
        });
        info.loadPromise = promise;

        return promise;
    }

    getSubtitles(name: string): string[] | undefined {
        return this.audios[name]?.subtitles;
    }

    getAudio(name: string): HTMLAudioElement | undefined {
        return this.audios[name]?.audio;
    }

    addLoadedSound({name, audio}: {name: string, audio: HTMLAudioElement}) {
        if (this.audios.hasOwnProperty(name)) {
            throw new Error(`Already loaded sound ${name}.`);
        }

        this.audios[name] = {
            loaded: true,
            audio,
            loadPromise: Promise.resolve(),
        };
    }

    playSound(name: string, {volume = 1}: {volume?: number} = {}) {
        if (this.muteState == MuteState.ALL_OFF) {
            return;
        }

        const audio = (this.audios[name]?.audio?.cloneNode() as HTMLAudioElement);
        if (audio == null) {
            return;
        }

        audio.volume *= this.volume * volume;
        audio.playbackRate = this.playbackRate;

        (audio as any).mozPreservesPitch = false;
        (audio as any).webkitPreservesPitch = false;
        (audio as any).preservesPitch = false;

        const promise = audio.play();
        promise?.catch(() => {});
    }

    playSoundAndWait(name: string, {volume = 1}: {volume?: number} = {}): { promise: Promise<void>, stop: () => void } {
        if (this.muteState == MuteState.ALL_OFF) {
            return { promise: Promise.resolve(), stop: () => {} };
        }

        const audio = (this.audios[name]?.audio?.cloneNode() as HTMLAudioElement);
        if (audio == null) {
            return { promise: Promise.resolve(), stop: () => {} };
        }

        audio.volume *= this.volume * volume;
        audio.playbackRate = this.playbackRate;

        let onEnded: (() => void) | undefined;
        const promise = new Promise<void>((resolve) => {
            onEnded = () => resolve();
            audio.onended = onEnded;
            audio.onerror = () => resolve();
            const p = audio.play();
            p?.catch(() => resolve());
        });

        const stop = () => {
            audio.pause();
            if (onEnded) {
                audio.removeEventListener('ended', onEnded);
            }
        };

        return { promise, stop };
    }

    /** We still run the logic here when muted, so that we can update things when unmuted. */
    async setSong(songName: string, { preserveTime = true }: { preserveTime?: boolean } = {}) {
        if (this.curSongName == songName) {
            return;
        }

        const lastSong = this.curSong;
        this.curSong?.pause();
        this.curSong = undefined;
        this.curSongName = undefined;

        const audioInfo = this.audios[songName];
        if (audioInfo == null) {
            return;
        }

        await audioInfo.loadPromise;

        const audio = (audioInfo.audio?.cloneNode() as HTMLAudioElement);
        if (audio == null) {
            return;
        }

        audio.volume = this.volume * VOLUME_MULTIPLE * this.songVolumeMultiplier;
        audio.loop = true;
        (audio as any).mozPreservesPitch = false;
        (audio as any).webkitPreservesPitch = false;
        (audio as any).preservesPitch = false;

        if (lastSong != null) {
            audio.playbackRate = lastSong.playbackRate;
            if (preserveTime) {
                audio.currentTime = lastSong.currentTime;
            }
        }

        if (this.muteState == MuteState.PLAY_ALL) {
            const promise = audio.play();
            promise?.catch(() => {});
        }

        this.curSong = audio;
        this.curSongName = songName;
    }

    setVolume(volume: number) {
        this.volume = volume;
        if (this.curSong != null) {
            this.curSong.volume = this.volume * VOLUME_MULTIPLE * this.songVolumeMultiplier;
        }
    }

    updatePlaybackRate(desiredRate: number, dt: number) {
        const updateAmt = 1 - Math.exp(-10 * dt);
        this.playbackRate = lerp(this.playbackRate, desiredRate, updateAmt);

        if (this.curSong != null) {
            this.curSong.playbackRate = this.playbackRate;
        }
    }

    loadMuteState() {
        const storedMuteString = window.sessionStorage.getItem('mute') ?? "";

        if (storedMuteString == '' && window.location.href.includes('localhost')) {
            console.log('Disabling music for local development');
            this.muteState = MuteState.MUSIC_OFF;
            return;
        }

        let muteState = parseInt(storedMuteString);
        if (muteState != MuteState.PLAY_ALL &&
            muteState != MuteState.MUSIC_OFF &&
            muteState != MuteState.ALL_OFF) {

            muteState = MuteState.PLAY_ALL;
        }
        this.muteState = muteState;
    }

    toggleMute() {
        switch (this.muteState) {
            case MuteState.PLAY_ALL:
                this.muteState = MuteState.MUSIC_OFF;
                break;
            case MuteState.MUSIC_OFF:
                this.muteState = MuteState.ALL_OFF;
                break;
            case MuteState.ALL_OFF:
            default:
                this.muteState = MuteState.PLAY_ALL;
                break;
        }
        window.sessionStorage.setItem('mute', this.muteState.toString());
        this.updateSoundMutedness();
    }

    updateSoundMutedness() {
        switch (this.muteState) {
            case MuteState.PLAY_ALL:
                if (this.curSong?.paused) {
                    const promise = this.curSong.play();
                    promise?.catch(() => {});
                }
                break;
            case MuteState.MUSIC_OFF:
            case MuteState.ALL_OFF:
                this.curSong?.pause();
                break;
        }
    }

    startSongIfNotAlreadyPlaying() {
        this.updateSoundMutedness();
    }
}

export const Sounds = new _Sounds();