import { boundedAudio } from "../services.ts";
import { createStore, createSignal, createEffect, onCleanup, onSettled, Show } from "solid-js";
import { formatTime, KEYS, readJSON, writeJSON } from "../domain.ts";
import styles from "../Soundgasm.module.css";

type Playback = { position: number; speed: number; loop: boolean; completed: boolean };
const rates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
export function Player(props: {
  source: string;
  title: string;
  author: string;
  subreddit: string;
  onNative: (show: boolean) => void;
}) {
  const key = `${location.hostname.toLowerCase().replace(/^www\./, "")}${location.pathname.replace(/\/$/, "")}`;
  const saved = readJSON<Record<string, Playback>>(KEYS.playback, {})[key];
  const [state, setState] = createStore({
    time: 0,
    duration: 0,
    paused: true,
    speed: Number(saved?.speed) >= 0.5 && Number(saved?.speed) <= 3 ? Number(saved.speed) : 1,
    loop: !!saved?.loop,
    status: "Preparando player…",
    native: false,
  });
  const [jump, setJump] = createSignal("");
  const [wave, setWave] = createStore({
    loading: false,
    peaks: [] as number[],
    note: "Visualização decorativa com seek preciso. Analise a mídia para amplitudes reais.",
  });
  let audio!: HTMLAudioElement, canvas!: HTMLCanvasElement;
  let restored = false,
    lastSaved = 0;
  let waveAbort: AbortController | undefined;
  const persist = (completed = false) => {
    if (!restored || !Number.isFinite(audio?.currentTime)) return;
    const history = readJSON<Record<string, Playback & { at?: number }>>(KEYS.playback, {});
    history[key] = {
      position: audio.currentTime,
      speed: audio.playbackRate,
      loop: audio.loop,
      completed,
      at: Date.now(),
    };
    writeJSON(
      KEYS.playback,
      Object.fromEntries(
        Object.entries(history)
          .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
          .slice(0, 200),
      ),
    );
  };
  const sync = () => {
    if (!audio) return;
    setState((draft) => {
      draft.time = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      draft.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      draft.paused = audio.paused;
    });
    if (Date.now() - lastSaved > 3000) {
      persist();
      lastSaved = Date.now();
    }
  };
  const seek = (time: number) => {
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, time));
    sync();
    persist();
  };
  const restore = () => {
    if (!restored && Number.isFinite(audio.duration) && audio.duration > 0) {
      restored = true;
      if (saved?.position > 0 && !saved.completed)
        seek(Math.min(saved.position, Math.max(0, audio.duration - 0.25)));
    }
    sync();
    setState((draft) => {
      draft.status = restored ? "Pronto para reproduzir" : "Aguardando duração…";
    });
  };
  const toggle = async () => {
    if (!props.source) {
      setState((draft) => {
        draft.status = "Aguardando o arquivo de áudio do site…";
      });
      return;
    }
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
      sync();
    } catch (error) {
      setState((draft) => {
        draft.status = `Falha ao tocar: ${(error as Error).message}`;
      });
    }
  };
  const speed = () => {
    const index = rates.indexOf(state.speed);
    const next = rates[(index + 1) % rates.length];
    audio.playbackRate = next;
    setState((draft) => {
      draft.speed = next;
    });
    persist();
  };
  const loop = () => {
    audio.loop = !state.loop;
    setState((draft) => {
      draft.loop = audio.loop;
    });
    persist();
  };
  const go = () => {
    const parts = jump().split(":").map(Number);
    if (parts.every(Number.isFinite)) seek(parts.reduce((value, part) => value * 60 + part, 0));
  };
  const draw = () => {
    const context = canvas?.getContext("2d");
    if (!context) return;
    const width = Math.max(50, canvas.getBoundingClientRect().width || 300),
      height = 118,
      dpr = Math.min(devicePixelRatio || 1, 2.5);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const peaks = wave.peaks.length
      ? wave.peaks
      : Array.from({ length: 100 }, (_, i) => 0.15 + Math.abs(Math.sin(i * 1.73) * Math.cos(i * 0.27)) * 0.7);
    const progress = state.duration ? state.time / state.duration : 0;
    peaks.forEach((peak, i) => {
      context.fillStyle = i / peaks.length <= progress ? "#f28dbb" : "#55455e";
      const h = Math.max(3, peak * height * 0.85);
      context.fillRect(
        (i / peaks.length) * width,
        height / 2 - h / 2,
        Math.max(1, width / peaks.length - 2),
        h,
      );
    });
  };
  const analyze = async () => {
    if (wave.loading || !props.source) return;
    if (!state.duration || state.duration > 660) {
      setWave((draft) => {
        draft.note =
          "A análise é limitada a 11 minutos para proteger a memória do iPhone. O seek preciso continua disponível.";
      });
      return;
    }
    waveAbort?.abort();
    waveAbort = new AbortController();
    const signal = waveAbort.signal;
    setWave((draft) => {
      draft.loading = true;
    });
    let context: AudioContext | undefined;
    try {
      // Transport and byte limits are a service; the component owns loading/error UI.
      const bytes = await boundedAudio(props.source, signal);
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) throw Error("Web Audio indisponível");
      context = new AudioCtx();
      const decoded = await context.decodeAudioData(bytes);
      signal.throwIfAborted();
      const samples = decoded.getChannelData(0);
      const peaks = Array.from({ length: 160 }, (_, i) => {
        const from = Math.floor((i / 160) * samples.length),
          to = Math.floor(((i + 1) / 160) * samples.length),
          stride = Math.max(1, Math.floor((to - from) / 64));
        let sum = 0,
          count = 0;
        for (let at = from; at < to; at += stride) {
          sum += samples[at] * samples[at];
          count++;
        }
        return Math.sqrt(sum / Math.max(1, count));
      });
      const max = Math.max(0.001, ...peaks);
      setWave((draft) => {
        draft.peaks = peaks.map((value) => Math.max(0.045, value / max));
        draft.note = "Waveform real gerada a partir das amostras do áudio.";
      });
    } catch (error) {
      if (!signal.aborted)
        setWave((draft) => {
          draft.note = `Não foi possível analisar: ${(error as Error).message}`;
        });
    } finally {
      await context?.close().catch(() => {});
      if (!signal.aborted)
        setWave((draft) => {
          draft.loading = false;
        });
    }
  };
  createEffect(() => ({ time: state.time, duration: state.duration, peaks: [...wave.peaks] }), draw);
  createEffect(
    () => props.source,
    (source) => {
      if (!audio || !source) return;
      restored = false;
      setState((draft) => {
        draft.status = "Carregando áudio…";
      }); /* src is bound declaratively below. */
    },
  );
  onSettled(() => {
    audio.playbackRate = state.speed;
    audio.loop = state.loop;
    const resize = new ResizeObserver(draw);
    resize.observe(canvas);
    const hide = () => persist();
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", hide);
    const media = navigator.mediaSession;
    if (media && typeof MediaMetadata !== "undefined") {
      media.metadata = new MediaMetadata({
        title: props.title,
        artist: props.author,
        album: props.subreddit || "Soundgasm",
      });
      for (const [name, action] of Object.entries({
        play: () => void audio.play(),
        pause: () => audio.pause(),
        seekbackward: () => seek(audio.currentTime - 15),
        seekforward: () => seek(audio.currentTime + 15),
        seekto: (event: any) => seek(event.seekTime),
      }))
        try {
          media.setActionHandler(name as MediaSessionAction, action);
        } catch {}
    }
    restore();
    draw();
    return () => {
      persist();
      waveAbort?.abort();
      resize.disconnect();
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", hide);
      audio.pause();
      if (media)
        for (const name of ["play", "pause", "seekbackward", "seekforward", "seekto"] as MediaSessionAction[])
          try {
            media.setActionHandler(name, null);
          } catch {}
    };
  });
  onCleanup(() => waveAbort?.abort());
  const canvasSeek = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width) seek(((event.clientX - rect.left) / rect.width) * state.duration);
  };
  return (
    <section class={styles["gws-sg-panel"]} aria-label="Player de áudio">
      <div class={styles["gws-sg-panelhead"]}>
        <div class={styles["gws-sg-pill"]}>● STUDIO PLAYER</div>
        <div id="gws-sg-status" role="status" class={styles["gws-sg-status"]}>
          {props.source ? state.status : "Aguardando arquivo de áudio…"}
        </div>
      </div>
      <div class={styles["gws-sg-wave-wrap"]}>
        <canvas
          ref={canvas}
          id="gws-sg-wave"
          height="118"
          role="slider"
          tabindex="0"
          aria-label="Posição na gravação"
          aria-valuemin="0"
          aria-valuemax={state.duration}
          aria-valuenow={state.time}
          onPointerDown={(event) => {
            canvas.setPointerCapture(event.pointerId);
            canvasSeek(event);
          }}
          onPointerMove={(event) => {
            if (canvas.hasPointerCapture(event.pointerId)) canvasSeek(event);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              seek(state.time + (event.key === "ArrowRight" ? 5 : -5));
            }
          }}
        />
      </div>
      <input
        id="gws-sg-progress"
        class={styles["gws-sg-progress"]}
        type="range"
        min="0"
        max={state.duration || 100}
        step="0.01"
        value={state.time}
        aria-label="Progresso preciso do áudio"
        onInput={(event) => seek(event.currentTarget.valueAsNumber)}
      />
      <div class={styles["gws-sg-time"]}>
        <span id="gws-sg-current">{formatTime(state.time)}</span>
        <span id="gws-sg-duration">{formatTime(state.duration)}</span>
      </div>
      <div class={styles["gws-sg-controls"]}>
        <button
          class={styles["gws-sg-control"]}
          onClick={() => seek(state.time - 15)}
          aria-label="Voltar 15 segundos"
        >
          ↶ 15
        </button>
        <button
          class={styles["gws-sg-control"]}
          onClick={() => seek(state.time - 5)}
          aria-label="Voltar 5 segundos"
        >
          −5
        </button>
        <button
          id="gws-sg-play"
          class={`${styles["gws-sg-control"]} ${styles["gws-sg-play"]}`}
          aria-label={state.paused ? "Reproduzir" : "Pausar"}
          onClick={toggle}
        >
          {state.paused ? "▶" : "Ⅱ"}
        </button>
        <button
          class={styles["gws-sg-control"]}
          onClick={() => seek(state.time + 5)}
          aria-label="Avançar 5 segundos"
        >
          +5
        </button>
        <button
          class={styles["gws-sg-control"]}
          onClick={() => seek(state.time + 15)}
          aria-label="Avançar 15 segundos"
        >
          15 ↷
        </button>
      </div>
      <div class={styles["gws-sg-secondary"]}>
        <button id="gws-sg-speed" class={styles["gws-sg-rate"]} onClick={speed}>
          {state.speed}×
        </button>
        <button
          id="gws-sg-loop"
          class={styles["gws-sg-loop"]}
          aria-pressed={state.loop ? "true" : "false"}
          onClick={loop}
        >
          ↻ Repetir
        </button>
        <div class={styles["gws-sg-seekrow"]}>
          <label for="gws-sg-timefield">Ir para</label>
          <input
            id="gws-sg-timefield"
            placeholder="12:34"
            value={jump()}
            onInput={(event) => setJump(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") go();
            }}
          />
          <button onClick={go}>OK</button>
        </div>
      </div>
      <div class={styles["gws-sg-actions"]}>
        <button
          id="gws-sg-realwave"
          class={styles["gws-sg-wave-btn"]}
          disabled={wave.loading}
          onClick={analyze}
        >
          {wave.loading ? "Analisando…" : "◒ Analisar waveform real"}
        </button>
        <button
          id="gws-sg-native"
          class={styles["gws-sg-copy"]}
          onClick={() => {
            const native = !state.native;
            setState((draft) => {
              draft.native = native;
            });
            props.onNative(native);
          }}
        >
          Player original
        </button>
      </div>
      <p id="gws-sg-wave-note" class={styles["gws-sg-note"]}>
        {wave.note}
      </p>
      <audio
        ref={audio}
        id="gws-sg-audio"
        src={props.source || undefined}
        preload="metadata"
        controls={state.native}
        loop={state.loop}
        onLoadedMetadata={restore}
        onDurationChange={restore}
        onCanPlay={restore}
        onTimeUpdate={sync}
        onRateChange={() => {
          setState((draft) => {
            draft.speed = audio.playbackRate;
          });
          persist();
        }}
        onPlay={sync}
        onPause={() => {
          sync();
          persist();
        }}
        onEnded={() => {
          sync();
          persist(true);
        }}
        onError={() =>
          setState((draft) => {
            draft.status = "Áudio indisponível. Use o player original ou recarregue a mídia.";
          })
        }
      />
    </section>
  );
}
