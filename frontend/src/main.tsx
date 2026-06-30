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
  RefreshCw,
  Save,
  Server,
  Settings,
  ShieldAlert,
  Trash2,
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

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: unknown }) {
  return (
    <div className="metric">
      <div className="metricIcon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{fmt(value)}</strong>
      </div>
    </div>
  );
}

function Detail({ snapshot, onRefresh }: { snapshot: Snapshot | null; onRefresh: (id: number) => void }) {
  if (!snapshot) {
    return (
      <section className="empty">
        <Server size={34} />
        <p>Keine Anlage ausgewählt</p>
      </section>
    );
  }

  const summary = snapshot.data.summary || {};
  const checks = snapshot.data.checks || [];
  const trunks = snapshot.data.trunks || [];
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
        <button className="iconText" onClick={() => onRefresh(snapshot.installation_id)} title="Jetzt aktualisieren">
          <RefreshCw size={16} />
          Aktualisieren
        </button>
      </div>

      <div className="metrics">
        <SummaryCard icon={<PhoneCall size={18} />} label="Aktive Gespräche" value={summary.active_calls} />
        <SummaryCard icon={<Activity size={18} />} label="SIP-Trunks" value={`${fmt(summary.trunks_registered)}/${fmt(summary.trunks_total)}`} />
        <SummaryCard icon={<Server size={18} />} label="Version" value={summary.version} />
        <SummaryCard icon={<Clock size={18} />} label="Letztes Backup" value={fmtDate(summary.last_backup)} />
      </div>

      <div className="contentGrid">
        <div className="panel">
          <h3>Health Checks</h3>
          <div className="checkList">
            {checks.length === 0 && <p className="muted">Noch keine Checks vorhanden.</p>}
            {checks.map((check) => (
              <div className="checkItem" key={check.name}>
                <Pill status={check.status} />
                <div>
                  <strong>{check.name}</strong>
                  <span>{check.message}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3>SIP-Trunks</h3>
          <div className="table">
            {trunks.length === 0 && <p className="muted">Keine Trunk-Details geliefert.</p>}
            {trunks.map((trunk, index) => (
              <div className="row" key={`${fmt(trunk.Id)}-${index}`}>
                <span>{fmt(trunk.Name || trunk.Number || trunk.ExternalNumber || `Trunk ${index + 1}`)}</span>
                <Pill status={trunk.IsOnline === false ? "critical" : "ok"} />
              </div>
            ))}
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

  const selected = useMemo(
    () => snapshots.find((item) => item.installation_id === selectedId) || snapshots[0] || null,
    [snapshots, selectedId]
  );

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
      if (!selectedId && dashboard[0]) setSelectedId(dashboard[0].installation_id);
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

  async function remove(id: number) {
    if (!confirm("Anlage wirklich löschen?")) return;
    await api(`/api/installations/${id}`, { method: "DELETE" });
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
          {snapshots.map((snapshot) => (
            <button
              className={`navItem ${selected?.installation_id === snapshot.installation_id ? "active" : ""}`}
              key={snapshot.installation_id}
              onClick={() => setSelectedId(snapshot.installation_id)}
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

        <Detail snapshot={selected} onRefresh={refresh} />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

