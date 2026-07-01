import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  LogOut,
  PhoneCall,
  Plus,
  MonitorCheck,
  Power,
  RefreshCw,
  Save,
  Server,
  Settings,
  ShieldAlert,
  Trash2,
  X,
  XCircle
} from "lucide-react";
import "./styles.css";

type Installation = {
  id: number;
  customer_name: string;
  base_url: string;
  client_id: string;
  enabled: boolean;
};

type HealthCheck = {
  name: string;
  status: "ok" | "warning" | "critical" | "unknown";
  message: string;
  details?: Record<string, unknown>;
};

type Snapshot = {
  installation_id: number;
  customer_name: string;
  base_url: string;
  status: "ok" | "warning" | "critical" | "unknown";
  message: string;
  checked_at: string | null;
  data: {
    summary?: Record<string, unknown>;
    trunks?: Record<string, unknown>[];
    events?: Record<string, unknown>[];
    checks?: HealthCheck[];
  };
};

const statusLabel = {
  ok: "OK",
  warning: "Warnung",
  critical: "Kritisch",
  unknown: "Unbekannt"
};

const healthCheckLabels: Record<string, string> = {
  "SIP trunks": "Trunks",
  "3CX services": "Dienste",
  "CRM integration": "CRM",
  "CRM Integrationen": "CRM",
  "3CX Services": "Dienste",
  "SIP-Trunks": "Trunks",
  "License": "Lizenz",
  "Lizenzlaufzeit": "Lizenz"
};

const overviewCheckNames = ["Trunks", "Dienste", "SBCs", "Lizenz"];
const statusSortOrder: Record<Snapshot["status"], number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  ok: 3
};

function token() {
  return localStorage.getItem("token") || "";
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token()) headers.set("Authorization", `Bearer ${token()}`);
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    localStorage.removeItem("token");
    location.reload();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  return String(value);
}

function fmtDate(value: unknown): string {
  if (!value || typeof value !== "string") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(date);
}

function healthCheckLabel(name: string): string {
  return healthCheckLabels[name] || name;
}

function visibleChecks(snapshot: Snapshot): HealthCheck[] {
  return (snapshot.data.checks || []).filter((check) => healthCheckLabel(check.name) !== "CRM");
}

function sortedSnapshots(snapshots: Snapshot[]): Snapshot[] {
  return [...snapshots].sort((a, b) => {
    const byStatus = statusSortOrder[a.status] - statusSortOrder[b.status];
    if (byStatus !== 0) return byStatus;
    return a.customer_name.localeCompare(b.customer_name, "de");
  });
}

function isPhoneNumberLike(value: string): boolean {
  const compact = value.replace(/[\s()+\-./]/g, "");
  return compact.length > 0 && /^\d+$/.test(compact);
}

function nestedValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}

function trunkName(trunk: Record<string, unknown>, index: number): string {
  const gateway = nestedValue(trunk, "Gateway");
  const candidates = [
    nestedValue(gateway, "Name"),
    trunk.DisplayName,
    trunk.FriendlyName,
    trunk.TrunkName,
    trunk.Description,
    trunk.ProviderName,
    trunk.Name,
    trunk.ExternalNumber,
    trunk.Number,
    trunk.AuthID
  ];
  const values = candidates.map(fmt).filter((value) => value !== "-");
  return values.find((value) => !isPhoneNumberLike(value)) || `Trunk ${index + 1}`;
}

function StatusIcon({ status }: { status: Snapshot["status"] | HealthCheck["status"] }) {
  if (status === "ok") return <CheckCircle2 size={18} />;
  if (status === "warning") return <AlertTriangle size={18} />;
  if (status === "critical") return <XCircle size={18} />;
  return <Clock size={18} />;
}

function Pill({ status }: { status: Snapshot["status"] | HealthCheck["status"] }) {
  return (
    <span className={`pill ${status}`}>
      <StatusIcon status={status} />
      {statusLabel[status] || status}
    </span>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      localStorage.setItem("token", result.token);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="loginPanel" onSubmit={submit}>
        <div className="brandRow">
          <Server size={24} />
          <h1>3CX Monitor</h1>
        </div>
        <label>
          Benutzer
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          Passwort
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>
          {busy ? <Loader2 className="spin" size={16} /> : <ShieldAlert size={16} />}
          Anmelden
        </button>
      </form>
    </main>
  );
}

function InstallationForm({ onSaved }: { onSaved: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api<Installation>("/api/installations", {
        method: "POST",
        body: JSON.stringify({
          customer_name: customerName,
          base_url: baseUrl,
          client_id: clientId,
          client_secret: clientSecret,
          enabled: true
        })
      });
      setCustomerName("");
      setBaseUrl("https://");
      setClientId("");
      setClientSecret("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="formGrid" onSubmit={submit}>
      <label>
        Kunde
        <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="ADICOM" />
      </label>
      <label>
        Anlagen-URL
        <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://kunde.on3cx.de" />
      </label>
      <label>
        API Client
        <input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="monitoring" />
      </label>
      <label>
        API Secret
        <input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} />
      </label>
      {error && <div className="error wide">{error}</div>}
      <button className="primary wide" disabled={busy}>
        {busy ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
        Anlage speichern
      </button>
    </form>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  onClick,
  title
}: {
  icon: React.ReactNode;
  label: string;
  value: unknown;
  onClick?: () => void;
  title?: string;
}) {
  const content = (
    <>
      <div className="metricIcon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{fmt(value)}</strong>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button className="metric metricButton" onClick={onClick} title={title}>
        {content}
      </button>
    );
  }

  return (
    <div className="metric">
      {content}
    </div>
  );
}

function CheckMark({ check }: { check?: HealthCheck }) {
  const status = check?.status || "unknown";
  const title = check ? `${healthCheckLabel(check.name)}: ${check.message}` : "Check nicht vorhanden";
  return (
    <span className={`checkMark ${status}`} title={title}>
      <StatusIcon status={status} />
    </span>
  );
}

function TrunksButton({ check, onClick }: { check?: HealthCheck; onClick: () => void }) {
  return (
    <button
      className="checkButton"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title="Trunk-Details anzeigen"
    >
      <CheckMark check={check} />
    </button>
  );
}

function TrunkModal({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  const trunks = snapshot.data.trunks || [];

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <section className="modalPanel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modalHeader">
          <div>
            <h3>SIP-Trunks</h3>
            <span>{snapshot.customer_name}</span>
          </div>
          <button className="iconOnly" onClick={onClose} title="Schließen">
            <X size={16} />
          </button>
        </div>
        <div className="trunkList">
          {trunks.length === 0 && <p className="muted">Keine Trunk-Details geliefert.</p>}
          {trunks.map((trunk, index) => (
            <div className="trunkRow" key={`${trunkName(trunk, index)}-${index}`}>
              <strong>{trunkName(trunk, index)}</strong>
              <Pill status={trunk.IsOnline === false ? "critical" : "ok"} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Dashboard({
  snapshots,
  onSelect,
  onReboot
}: {
  snapshots: Snapshot[];
  onSelect: (id: number) => void;
  onReboot: (snapshot: Snapshot) => void;
}) {
  const [trunkSnapshot, setTrunkSnapshot] = useState<Snapshot | null>(null);
  const totals = snapshots.reduce(
    (acc, snapshot) => {
      acc.total += 1;
      acc[snapshot.status] += 1;
      return acc;
    },
    { total: 0, ok: 0, warning: 0, critical: 0, unknown: 0 }
  );
  const orderedSnapshots = useMemo(() => sortedSnapshots(snapshots), [snapshots]);

  return (
    <section className="dashboard">
      <div className="overviewMetrics">
        <SummaryCard icon={<Server size={18} />} label="Anlagen" value={totals.total} />
        <SummaryCard icon={<CheckCircle2 size={18} />} label="OK" value={totals.ok} />
        <SummaryCard icon={<AlertTriangle size={18} />} label="Warnungen" value={totals.warning} />
        <SummaryCard icon={<XCircle size={18} />} label="Kritisch" value={totals.critical} />
      </div>

      {snapshots.length === 0 && (
        <section className="empty">
          <Server size={34} />
          <p>Noch keine Anlagen.</p>
        </section>
      )}
      {snapshots.length > 0 && (
        <div className="healthTableWrap">
          <table className="healthTable">
            <colgroup>
              <col className="statusColumn" />
              <col className="customerColumn" />
              {overviewCheckNames.map((name) => (
                <col className="checkColumn" key={name} />
              ))}
              <col className="actionColumn" />
            </colgroup>
            <thead>
              <tr>
                <th className="statusCell">Status</th>
                <th className="customerCell">Kunde</th>
                {overviewCheckNames.map((name) => (
                  <th key={name}>{name}</th>
                ))}
                <th className="actionCell">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {orderedSnapshots.map((snapshot) => {
                const checks = visibleChecks(snapshot);
                return (
                  <tr
                    className={`healthRow ${snapshot.status}`}
                    key={snapshot.installation_id}
                    onClick={() => onSelect(snapshot.installation_id)}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") onSelect(snapshot.installation_id);
                    }}
                  >
                    <td className="statusCell">
                      <Pill status={snapshot.status} />
                    </td>
                    <td className="customerCell">
                      <strong>{snapshot.customer_name}</strong>
                    </td>
                    {overviewCheckNames.map((name) => {
                      const check = checks.find((item) => healthCheckLabel(item.name) === name);
                      if (name === "Trunks") {
                        return (
                          <td className="checkCell" key={name}>
                            <TrunksButton check={check} onClick={() => setTrunkSnapshot(snapshot)} />
                          </td>
                        );
                      }
                      return (
                        <td className="checkCell" key={name}>
                          <CheckMark check={check} />
                        </td>
                      );
                    })}
                    <td className="actionCell">
                      <button
                        className="dangerText"
                        onClick={(event) => {
                          event.stopPropagation();
                          onReboot(snapshot);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                        title="OS neu starten"
                      >
                        <Power size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {trunkSnapshot && <TrunkModal snapshot={trunkSnapshot} onClose={() => setTrunkSnapshot(null)} />}
    </section>
  );
}

function Detail({
  snapshot,
  onRefresh,
  onReboot
}: {
  snapshot: Snapshot | null;
  onRefresh: (id: number) => void;
  onReboot: (snapshot: Snapshot) => void;
}) {
  const [trunkSnapshot, setTrunkSnapshot] = useState<Snapshot | null>(null);

  if (!snapshot) {
    return (
      <section className="empty">
        <Server size={34} />
        <p>Keine Anlage ausgewählt</p>
      </section>
    );
  }

  const summary = snapshot.data.summary || {};
  const checks = visibleChecks(snapshot);
  const events = snapshot.data.events || [];

  return (
    <section className="detail">
      <div className="detailHeader">
        <div>
          <div className="titleLine">
            <h2>{snapshot.customer_name}</h2>
            <Pill status={snapshot.status} />
          </div>
          <a href={snapshot.base_url} target="_blank" rel="noreferrer">
            {snapshot.base_url}
            <ExternalLink size={14} />
          </a>
        </div>
        <div className="detailActions">
          <button className="iconText" onClick={() => onRefresh(snapshot.installation_id)} title="Jetzt aktualisieren">
            <RefreshCw size={16} />
            Aktualisieren
          </button>
          <button className="dangerText" onClick={() => onReboot(snapshot)} title="OS neu starten">
            <Power size={16} />
          </button>
        </div>
      </div>

      <div className="metrics">
        <SummaryCard icon={<PhoneCall size={18} />} label="Aktive Gespräche" value={summary.active_calls} />
        <SummaryCard
          icon={<Activity size={18} />}
          label="SIP-Trunks"
          value={`${fmt(summary.trunks_registered)}/${fmt(summary.trunks_total)}`}
          onClick={() => setTrunkSnapshot(snapshot)}
          title="Trunk-Details anzeigen"
        />
        <SummaryCard icon={<Server size={18} />} label="Version" value={summary.version} />
        <SummaryCard icon={<Clock size={18} />} label="Letztes Backup" value={fmtDate(summary.last_backup)} />
      </div>

      <div className="contentGrid">
        <div className="panel widePanel">
          <h3>Health Checks</h3>
          <div className="checkList">
            {checks.length === 0 && <p className="muted">Noch keine Checks vorhanden.</p>}
            {checks.map((check) => {
              const label = healthCheckLabel(check.name);
              const content = (
                <>
                  <Pill status={check.status} />
                  <div>
                    <strong>{label}</strong>
                    <span>{check.message}</span>
                  </div>
                </>
              );
              if (label === "Trunks") {
                return (
                  <button className="checkItem checkItemButton" key={check.name} onClick={() => setTrunkSnapshot(snapshot)}>
                    {content}
                  </button>
                );
              }
              return (
                <div className="checkItem" key={check.name}>
                  {content}
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel widePanel">
          <h3>Letzte Ereignisse</h3>
          <div className="eventList">
            {events.length === 0 && <p className="muted">Keine Ereignisse geliefert.</p>}
            {events.map((event, index) => (
              <div className="eventItem" key={index}>
                <time>{fmtDate(event.TimeGenerated || event.Timestamp || event.DateTime)}</time>
                <strong>{fmt(event.EventId || event.Id || event.EventCode)}</strong>
                <span>{fmt(event.Message || event.Text || event.Description || JSON.stringify(event))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="footerNote">
        Zuletzt geprüft: {fmtDate(snapshot.checked_at)} · {snapshot.message}
      </div>
      {trunkSnapshot && <TrunkModal snapshot={trunkSnapshot} onClose={() => setTrunkSnapshot(null)} />}
    </section>
  );
}

function App() {
  const [loggedIn, setLoggedIn] = useState(Boolean(token()));
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const orderedSnapshots = useMemo(() => sortedSnapshots(snapshots), [snapshots]);

  const selected = useMemo(
    () => snapshots.find((item) => item.installation_id === selectedId) || null,
    [snapshots, selectedId]
  );

  function selectInstallation(id: number | null) {
    setSelectedId(id);
  }

  async function load() {
    if (!loggedIn) return;
    setError("");
    try {
      const [items, dashboard] = await Promise.all([
        api<Installation[]>("/api/installations"),
        api<Snapshot[]>("/api/dashboard")
      ]);
      setInstallations(items);
      setSnapshots(dashboard);
      setSelectedId((current) => {
        return current && dashboard.some((item) => item.installation_id === current) ? current : null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Daten konnten nicht geladen werden");
    }
  }

  useEffect(() => {
    load();
    const id = window.setInterval(load, 15000);
    return () => window.clearInterval(id);
  }, [loggedIn]);

  async function refresh(id: number) {
    setBusy(true);
    try {
      const updated = await api<Snapshot>(`/api/installations/${id}/refresh`, { method: "POST" });
      setSnapshots((items) => items.map((item) => (item.installation_id === id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktualisierung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function reboot(snapshot: Snapshot) {
    const confirmed = confirm(
      `Soll die 3CX-Anlage von ${snapshot.customer_name} wirklich neu gestartet werden?\n\nDas startet das Betriebssystem neu und unterbricht laufende Telefonie.`
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      await api<{ status: string }>(`/api/installations/${snapshot.installation_id}/reboot-os`, { method: "POST" });
      alert(`Neustart für ${snapshot.customer_name} wurde angefordert.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Neustart konnte nicht angefordert werden");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Anlage wirklich löschen?")) return;
    await api(`/api/installations/${id}`, { method: "DELETE" });
    setSelectedId((current) => {
      return current === id ? null : current;
    });
    await load();
  }

  if (!loggedIn) return <Login onDone={() => setLoggedIn(true)} />;

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brandRow">
          <Server size={22} />
          <h1>3CX Monitor</h1>
        </div>
        <button className="primary" onClick={() => setShowAdmin((value) => !value)}>
          <Plus size={16} />
          Anlage hinzufügen
        </button>
        <div className="navList">
          <button className={`navItem ${selectedId === null ? "active" : ""}`} onClick={() => selectInstallation(null)}>
            <div>
              <strong>Übersicht</strong>
              <span>Alle Kunden und Health-Checks</span>
            </div>
            <MonitorCheck size={18} />
          </button>
          {orderedSnapshots.map((snapshot) => (
            <button
              className={`navItem ${selectedId === snapshot.installation_id ? "active" : ""}`}
              key={snapshot.installation_id}
              onClick={() => selectInstallation(snapshot.installation_id)}
            >
              <div>
                <strong>{snapshot.customer_name}</strong>
                <span>{snapshot.base_url}</span>
              </div>
              <StatusIcon status={snapshot.status} />
            </button>
          ))}
          {snapshots.length === 0 && <p className="muted pad">Noch keine Anlagen.</p>}
        </div>
        <button
          className="ghost"
          onClick={() => {
            localStorage.removeItem("token");
            setLoggedIn(false);
          }}
        >
          <LogOut size={16} />
          Abmelden
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Monitoring</span>
            <h2>{installations.length} Anlage(n)</h2>
          </div>
          <div className="topActions">
            {busy && <Loader2 className="spin" size={18} />}
            <button className="iconText" onClick={load} title="Dashboard neu laden">
              <RefreshCw size={16} />
              Neu laden
            </button>
            <button className="iconText" onClick={() => setShowAdmin((value) => !value)} title="Administration">
              <Settings size={16} />
              Admin
            </button>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        {showAdmin && (
          <section className="adminBand">
            <h3>Anlagenverwaltung</h3>
            <InstallationForm onSaved={load} />
            <div className="adminList">
              {installations.map((item) => (
                <div className="adminRow" key={item.id}>
                  <div>
                    <strong>{item.customer_name}</strong>
                    <span>{item.base_url} · Client: {item.client_id}</span>
                  </div>
                  <button className="dangerIcon" onClick={() => remove(item.id)} title="Löschen">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {selected ? (
          <Detail snapshot={selected} onRefresh={refresh} onReboot={reboot} />
        ) : (
          <Dashboard snapshots={snapshots} onSelect={selectInstallation} onReboot={reboot} />
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
