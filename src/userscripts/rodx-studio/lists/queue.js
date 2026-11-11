import { Studio } from "../core/studio.js";
import { requestInternal, requestTemplates, templateRequest } from "./graphql.js";
import { currentList, notice, toggle } from "./quick-picker.js";
import {
  APP,
  QUEUE_LEASE_KEY,
  WRITE_LEDGER_KEY,
  displayListName,
  getAll,
  listPresets,
  listUsage,
  loadJSON,
  membersFor,
  now,
  ownTabId,
  readQueue,
  routeListId,
  saveQueue,
  settings,
  sleep,
  state,
  upsertMember,
  validHandle,
  validListId,
} from "./render.js";
import { scheduleRefresh } from "./view.js";

export function applyRepostFilter() {
  Studio.emit("lists:settings", {
    id: routeListId() || state.listId,
    settings,
  });
}

export let MAX_WRITES_HOUR;

export function initializeListsMAX_WRITES_HOUR() {
  MAX_WRITES_HOUR = 10;
}

export let MAX_WRITES_DAY;

export function initializeListsMAX_WRITES_DAY() {
  MAX_WRITES_DAY = 40;
}

export let queueDelay;

export function initializeListsQueueDelay() {
  queueDelay = () => Math.max(60, Math.min(3600, Number(settings.queueIntervalSeconds) || 90)) * 1000;
}

export function writeLedger() {
  const cutoff = Date.now() - 86400000;
  return loadJSON(WRITE_LEDGER_KEY, []).filter((ms) => Number(ms) > cutoff && Number(ms) <= Date.now());
}

export function reserveWrite() {
  const ledger = writeLedger();
  const hourly = ledger.filter((ms) => ms > Date.now() - 3600000);
  if (hourly.length >= MAX_WRITES_HOUR)
    throw new Error("Limite local: 10 alterações/hora. Fila pausada; retome mais tarde.");
  if (ledger.length >= MAX_WRITES_DAY)
    throw new Error("Limite local: 40 alterações/24 h. Fila pausada; retome amanhã.");
  const blockedUntil = Number(sessionStorage.getItem(`${APP}:rate-low-until`) || 0);
  if (blockedUntil > Date.now())
    throw new Error("O X informou cota quase esgotada. Fila pausada até a janela de limite terminar.");
  ledger.push(Date.now()); // Reserva conservadora inclusive quando a rede falha.
  localStorage.setItem(WRITE_LEDGER_KEY, JSON.stringify(ledger));
}

export function acquireLease() {
  const existing = loadJSON(QUEUE_LEASE_KEY, null);
  if (existing?.expiresAt > Date.now() && existing.owner !== ownTabId)
    throw new Error("A fila já está ativa em outra aba do X.");
  localStorage.setItem(
    QUEUE_LEASE_KEY,
    JSON.stringify({
      owner: ownTabId,
      expiresAt: Date.now() + 150000,
    }),
  );
  if (loadJSON(QUEUE_LEASE_KEY, null)?.owner !== ownTabId) throw new Error("Outra aba assumiu a fila.");
}

export function releaseLease() {
  if (loadJSON(QUEUE_LEASE_KEY, null)?.owner === ownTabId) localStorage.removeItem(QUEUE_LEASE_KEY);
}

export function makeQueue(members) {
  const target = state.lists.find((x) => x.id === state.targetId);
  if (!validListId(state.listId) || !target || state.listId === target.id)
    return notice("Escolha outra lista sua como destino.", "error");
  const unique = [
    ...new Map(
      members.filter((m) => validHandle(m.username)).map((m) => [m.username.toLowerCase(), m]),
    ).values(),
  ];
  if (!unique.length) return notice("Selecione membros válidos.", "error");
  const active = readQueue();
  if (active && !["done", "cancelled"].includes(active.status))
    return notice("Pause/cancele a fila existente antes de iniciar outra.", "error");
  const text = `Copiar ${unique.length} membro(s) para ${target.name}?\nSeguir: ${state.follow ? "SIM" : "NÃO"} · Desativar reposts: ${state.disableReposts ? "SIM" : "NÃO"}\n\nRequests internos em série, máximo de 10 escritas/hora e 40/24h, com pausa em limites. Nenhuma ação será revertida automaticamente.`;
  if (!window.confirm(text)) return;
  const q = {
    version: 2,
    sourceId: state.listId,
    sourceName: displayListName(
      currentList() || {
        id: state.listId,
      },
    ),
    targetId: target.id,
    targetName: target.name,
    follow: state.follow,
    disableReposts: state.disableReposts,
    status: "running",
    index: 0,
    createdAt: now(),
    nextAt: 0,
    tasks: unique.map((m) => ({
      username: m.username,
      userId: m.userId || "",
      status: "pending",
      error: "",
      warnings: [],
      copied: false,
      followDone: false,
      repostsDone: false,
    })),
  };
  saveQueue(q);
  state.tab = "fila";
  toggle(true);
  runQueue();
}

export async function enqueueQuickAdd(user, targetId, { follow = false, disableReposts = false } = {}) {
  if (!validHandle(user.username) || !validListId(targetId)) throw new Error("Usuário ou lista inválidos.");
  if (user.sourceId === targetId) throw new Error("Esse usuário já está na lista de origem.");
  const target = state.lists.find((l) => l.id === targetId);
  if (!target) throw new Error("Lista ainda não está sincronizada.");
  let q = readQueue();
  if (q && q.status === "running" && !queueRunning) {
    q.status = "paused";
    q.lastError = "Execução anterior interrompida. Verifique a fila e retome manualmente.";
    saveQueue(q);
  }
  if (q && !["done", "cancelled"].includes(q.status)) {
    const duplicate = q.tasks.some(
      (t) =>
        t.username.toLowerCase() === user.username.toLowerCase() &&
        (t.targetId || q.targetId) === targetId &&
        !["error", "skipped"].includes(t.status),
    );
    if (duplicate) throw new Error("Esse usuário já está na fila para essa lista.");
  } else {
    q = {
      version: 3,
      sourceId: user.sourceId || "",
      sourceName: "Adição rápida",
      targetId,
      targetName: target.name,
      follow: false,
      disableReposts: false,
      status: "running",
      index: 0,
      createdAt: now(),
      nextAt: 0,
      tasks: [],
    };
  }
  q.tasks.push({
    username: user.username,
    userId: user.userId || "",
    targetId,
    follow: Boolean(follow),
    disableReposts: Boolean(disableReposts),
    status: "pending",
    error: "",
    warnings: [],
    copied: false,
    followDone: false,
    repostsDone: false,
  });
  saveQueue(q);
  if (q.status === "running") runQueue();
  return q;
}

export let queueWait;

export function initializeListsQueueWait() {
  queueWait = async (ms) => {
    const until = Date.now() + Math.max(0, ms);
    while (document.hidden || Date.now() < until) {
      if (readQueue()?.status !== "running") throw new Error("Fila pausada");
      acquireLease(); // Renova o lease mesmo durante pausas longas, evitando outra aba executar.
      if (document.hidden) {
        await sleep(2000);
        continue;
      }
      await sleep(Math.min(1500, Math.max(50, until - Date.now())));
    }
  };
}

export async function resolveUserId(username) {
  // Primeira fonte: ID numérico persistido em respostas User da própria timeline.
  const matches = (await getAll("members")).find(
    (m) => m.username.toLowerCase() === username.toLowerCase() && validListId(m.userId),
  );
  if (matches) return matches.userId;
  if (!requestTemplates.UserByScreenName) return "";
  const vars = JSON.parse(requestTemplates.UserByScreenName.params.variables || "{}");
  const key = "screen_name" in vars ? "screen_name" : "screenName";
  const r = templateRequest("UserByScreenName", {
    [key]: username,
  });
  const result = await requestInternal(r.path, {
    params: r.params,
  });
  const id = String(result?.data?.user?.result?.rest_id || result?.data?.user?.result?.legacy?.id_str || "");
  return validListId(id) ? id : "";
}

export let DEFAULT_MUTATION_FEATURES;

export function initializeListsDEFAULT_MUTATION_FEATURES() {
  DEFAULT_MUTATION_FEATURES = {
    profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_profile_redirect_enabled: false,
    rweb_tipjar_consumption_enabled: false,
    verified_phone_label_enabled: false,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
  };
}

export async function addMemberInternal(listId, userId, username) {
  if (validListId(userId)) {
    // ID de 2026 como fallback; se o X rotacionar, os requests param com erro.
    const t = requestTemplates.ListAddMember;
    const queryId = t?.path?.split("/")[4] || "vWPi0CTMoPFsjsL6W4IynQ";
    const features = t?.features || DEFAULT_MUTATION_FEATURES;
    const result = await requestInternal(`/i/api/graphql/${queryId}/ListAddMember`, {
      method: "POST",
      payload: {
        variables: {
          listId,
          userId,
        },
        features,
        queryId,
      },
    });
    if (!result || !result.data) throw new Error("O X não confirmou a inclusão GraphQL.");
    return;
  }
  // Legacy interno admite @handle; o X pode desativar este recurso a qualquer momento.
  const result = await requestInternal("/i/api/1.1/lists/members/create.json", {
    method: "POST",
    form: {
      list_id: listId,
      screen_name: username,
    },
  });
  if (!result || typeof result !== "object") throw new Error("Sem confirmação de inclusão na lista.");
}

export async function followInternal(username) {
  const result = await requestInternal("/i/api/1.1/friendships/create.json", {
    method: "POST",
    form: {
      screen_name: username,
      follow: "true",
    },
  });
  if (!result || typeof result !== "object") throw new Error("O X não confirmou o follow.");
}

export async function disableRepostsInternal(username) {
  const result = await requestInternal("/i/api/1.1/friendships/update.json", {
    method: "POST",
    form: {
      screen_name: username,
      retweets: "false",
    },
  });
  if (!result || typeof result !== "object") throw new Error("O X não confirmou a configuração de reposts.");
}

export function pauseQueue(reason, retryAfter = 0) {
  const q = readQueue();
  if (!q) return;
  q.status = "paused";
  q.lastError = reason;
  if (retryAfter) q.nextAt = Date.now() + retryAfter * 1000;
  const task = q.tasks[q.index];
  if (task && task.status !== "ok") {
    task.status = "error";
    task.error = reason;
    // A ausência de resposta inequívoca não prova que o X rejeitou a escrita.
    task.uncertain = /^(?:HTTP 5\d\d|Failed to fetch|Load failed|NetworkError|Tempo esgotado)/i.test(reason);
  }
  saveQueue(q);
  notice(reason, "error");
}

export let queueRunning;

export function initializeListsQueueRunning() {
  queueRunning = false;
}

export async function runQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    acquireLease();
    let q = readQueue();
    if (!q || q.status !== "running") return;
    if (!state.authReady)
      throw new Error(
        "Autenticação interna ainda não identificada. Navegue no X normalmente e retome a fila.",
      );
    while ((q = readQueue())?.status === "running" && q.index < q.tasks.length) {
      acquireLease();
      if (!navigator.onLine) throw new Error("Sem conexão.");
      if (q.nextAt > Date.now()) await queueWait(q.nextAt - Date.now());
      if (document.hidden) await queueWait(2000);
      q = readQueue();
      if (q.status !== "running") break;
      const task = q.tasks[q.index];
      if (!validHandle(task.username)) throw new Error("Membro com @usuário inválido.");
      if (task.status === "processing" && !task.copied && !task.followDone && !task.repostsDone)
        throw new Error(
          "A última tentativa foi interrompida em andamento; confira o destino antes de continuar.",
        );
      task.status = "processing";
      saveQueue(q);
      if (!task.copied) {
        const targetId = task.targetId || q.targetId;
        const known = await membersFor(targetId);
        const already = known.some((m) => m.username.toLowerCase() === task.username.toLowerCase());
        if (!already) {
          if (!task.userId) task.userId = await resolveUserId(task.username);
          reserveWrite();
          q.nextAt = Date.now() + queueDelay();
          saveQueue(q);
          await addMemberInternal(targetId, task.userId, task.username);
        } else task.warnings.push("Já consta no cache local do destino; não foi reenviado.");
        q = readQueue();
        q.tasks[q.index].copied = true;
        saveQueue(q);
        await upsertMember(targetId, task.username);
      }
      if ((task.follow ?? q.follow) && !q.tasks[q.index].followDone) {
        q = readQueue();
        if (q.status !== "running") throw new Error("Fila pausada");
        await queueWait(Math.max(0, (q.nextAt || 0) - Date.now()));
        reserveWrite();
        q.nextAt = Date.now() + queueDelay();
        saveQueue(q);
        await followInternal(task.username);
        q = readQueue();
        q.tasks[q.index].followDone = true;
        saveQueue(q);
      }
      if ((task.disableReposts ?? q.disableReposts) && !q.tasks[q.index].repostsDone) {
        q = readQueue();
        if (q.status !== "running") throw new Error("Fila pausada");
        await queueWait(Math.max(0, (q.nextAt || 0) - Date.now()));
        reserveWrite();
        q.nextAt = Date.now() + queueDelay();
        saveQueue(q);
        await disableRepostsInternal(task.username);
        q = readQueue();
        q.tasks[q.index].repostsDone = true;
        saveQueue(q);
      }
      q = readQueue();
      q.tasks[q.index].status = "ok";
      q.tasks[q.index].error = "";
      q.index++;
      if (q.index >= q.tasks.length) q.status = "done";
      saveQueue(q);
      scheduleRefresh();
      if (q.status === "done") {
        notice("Merge enviado e confirmado nas respostas recebidas. Revise a lista no X.", "ok");
        break;
      }
      await queueWait(Math.max(0, (q.nextAt || 0) - Date.now()));
    }
  } catch (error) {
    if (error.message !== "Fila pausada") pauseQueue(error.message || String(error), error.retryAfter || 0);
  } finally {
    queueRunning = false;
    releaseLease();
  }
}

export function downloadBlob(name, text, type) {
  const blob = new Blob([text], {
    type,
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function exportJSON() {
  const backup = {
    app: "x-lists-studio",
    version: 3,
    exportedAt: now(),
    lists: await getAll("lists"),
    members: await getAll("members"),
    settings: {
      ...settings,
    },
    listPresets: {
      ...listPresets,
    },
    listUsage: {
      ...listUsage,
    },
  };
  downloadBlob(
    `x-lists-studio-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(backup, null, 2),
    "application/json",
  );
  notice(`Backup com ${backup.lists.length} listas e ${backup.members.length} membros gerado.`, "ok");
}
