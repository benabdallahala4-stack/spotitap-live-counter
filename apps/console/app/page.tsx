'use client';

import { useEffect, useMemo, useState } from 'react';

type PrototypeTarget = {
  counterId: string;
  label: string;
  platform: 'instagram' | 'facebook' | 'tiktok';
  status: 'reserved' | 'active' | 'paused';
  verifiedCount: number;
  optimisticDelta: number;
  displayedCount: number;
  deviceId: string;
  deviceSerial: string;
  deviceStatus: 'manufactured' | 'claimed' | 'online' | 'offline';
};

type CommandMode = 'verified' | 'test';
type Tab = 'internal' | 'provider' | 'protocol';
type StatusKind = '' | 'success' | 'error';

type HistoryItem = {
  mode: 'verified_count' | 'admin_test';
  status: 'sent' | 'failed';
  label: string;
  target: number;
  sentAt: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:4100';

function apiUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
}

export default function PrototypeConsolePage() {
  const [adminToken, setAdminToken] = useState('');
  const [targets, setTargets] = useState<PrototypeTarget[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState('');
  const [targetCount, setTargetCount] = useState('');
  const [providerTargetCount, setProviderTargetCount] = useState('');
  const [commandMode, setCommandMode] = useState<CommandMode>('verified');
  const [activeTab, setActiveTab] = useState<Tab>('internal');
  const [status, setStatus] = useState({ message: 'Paste the admin token and save it to load prototype targets.', kind: '' as StatusKind });
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    setAdminToken(localStorage.getItem('spotitap.adminToken') || '');
    setHistory(JSON.parse(localStorage.getItem('spotitap.prototype.history') || '[]') as HistoryItem[]);
  }, []);

  const selectedTarget = useMemo(() => {
    return targets.find((target) => target.counterId === selectedCounterId) || targets[0];
  }, [selectedCounterId, targets]);

  const preview = useMemo(() => {
    if (!selectedTarget) {
      return 'Load targets to preview a device payload.';
    }

    const count = Number.parseInt(targetCount || String(selectedTarget.displayedCount), 10);
    const reason = commandMode === 'test' ? 'admin_test' : 'verified_count';
    return JSON.stringify(
      {
        topic: `devices/${selectedTarget.deviceId}/commands/set-count`,
        payload: {
          counterId: selectedTarget.counterId,
          target: Number.isFinite(count) ? count : 0,
          reason,
          eventId: reason === 'admin_test' ? 'admin-test' : 'verified-count',
          sentAt: new Date().toISOString()
        }
      },
      null,
      2
    );
  }, [commandMode, selectedTarget, targetCount]);

  function showStatus(message: string, kind: StatusKind = '') {
    setStatus({ message, kind });
  }

  function saveToken() {
    localStorage.setItem('spotitap.adminToken', adminToken.trim());
    showStatus('Admin token saved in this browser.', 'success');
    void loadTargets();
  }

  function authHeaders(): Record<string, string> {
    return adminToken.trim() ? { authorization: `Bearer ${adminToken.trim()}` } : {};
  }

  async function loadTargets() {
    try {
      showStatus('Loading prototype targets...');
      const response = await fetch(apiUrl('/admin/prototype-targets'), {
        headers: authHeaders()
      });
      const body = (await response.json()) as { targets?: PrototypeTarget[]; error?: string };
      if (!response.ok) {
        throw new Error(body.error || `Request failed with ${response.status}`);
      }

      const loadedTargets = body.targets || [];
      setTargets(loadedTargets);
      setSelectedCounterId((current) => current || loadedTargets[0]?.counterId || '');
      showStatus(`Loaded ${loadedTargets.length} prototype target(s).`, 'success');
    } catch (error) {
      showStatus(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  async function sendCount(providerMode = false) {
    if (!selectedTarget) {
      showStatus('Select a target before sending a count.', 'error');
      return;
    }

    const countInput = providerMode ? providerTargetCount : targetCount;
    const parsedCount = Number.parseInt(countInput, 10);
    if (!Number.isInteger(parsedCount) || parsedCount < 0 || parsedCount > 9_999_999) {
      showStatus('Target count must be an integer from 0 to 9999999.', 'error');
      return;
    }

    const verified = providerMode ? false : commandMode === 'verified';
    const endpoint = verified
      ? `/admin/counters/${encodeURIComponent(selectedTarget.counterId)}/verified-count`
      : `/admin/counters/${encodeURIComponent(selectedTarget.counterId)}/test-count`;
    const payload = verified
      ? { verifiedCount: parsedCount, source: 'prototype_console' }
      : { target: parsedCount };

    try {
      showStatus('Sending command...');
      const response = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || `Request failed with ${response.status}`);
      }

      rememberCommand({
        mode: verified ? 'verified_count' : 'admin_test',
        status: 'sent',
        label: selectedTarget.label,
        target: parsedCount,
        sentAt: new Date().toLocaleString()
      });
      showStatus(`Command sent to ${selectedTarget.deviceSerial}.`, 'success');
      await loadTargets();
    } catch (error) {
      rememberCommand({
        mode: verified ? 'verified_count' : 'admin_test',
        status: 'failed',
        label: selectedTarget.label,
        target: parsedCount,
        sentAt: new Date().toLocaleString()
      });
      showStatus(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  function rememberCommand(item: HistoryItem) {
    setHistory((current) => {
      const next = [item, ...current].slice(0, 20);
      localStorage.setItem('spotitap.prototype.history', JSON.stringify(next));
      return next;
    });
  }

  function updateProviderCount(value: string) {
    setProviderTargetCount(value);
    if (value) {
      setTargetCount(value);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <h1>Spotitap Prototype Console</h1>
            <p className="subtle">React/Next.js console for backend and hardware integration</p>
          </div>
        </div>
        <div className="token-box">
          <input
            type="password"
            autoComplete="off"
            placeholder="Admin token"
            value={adminToken}
            onChange={(event) => setAdminToken(event.target.value)}
          />
          <button className="btn" type="button" onClick={saveToken}>
            Save Token
          </button>
        </div>
      </header>

      <main className="main">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Targets</div>
              <p className="subtle">Counters linked to prototype devices</p>
            </div>
            <button className="btn" type="button" onClick={() => void loadTargets()}>
              Refresh
            </button>
          </div>
          <div className="panel-body">
            <div className="target-list">
              {targets.length === 0 ? (
                <p className="subtle">No prototype targets loaded.</p>
              ) : (
                targets.map((target) => (
                  <button
                    className="target-card"
                    type="button"
                    key={target.counterId}
                    aria-current={target.counterId === selectedTarget?.counterId}
                    onClick={() => setSelectedCounterId(target.counterId)}
                  >
                    <div className="target-name">{target.label}</div>
                    <div className="target-meta">
                      {target.platform} / {target.status}
                    </div>
                    <div className="target-meta">
                      {target.deviceSerial} / {target.deviceStatus}
                    </div>
                    <div className="target-meta">{target.counterId}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div className="tabs" role="tablist" aria-label="Console mode">
              {(['internal', 'provider', 'protocol'] as const).map((tab) => (
                <button
                  className="tab"
                  role="tab"
                  aria-selected={activeTab === tab}
                  type="button"
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'internal' ? 'Internal' : tab === 'provider' ? 'Provider Mode' : 'Protocol'}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-body">
            {activeTab === 'internal' ? (
              <section>
                <div className="metric-row">
                  <Metric label="Displayed" value={selectedTarget?.displayedCount ?? '-'} />
                  <Metric label="Verified" value={selectedTarget?.verifiedCount ?? '-'} />
                  <Metric label="Optimistic" value={selectedTarget?.optimisticDelta ?? '-'} />
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="target-count">Target Count</label>
                    <input
                      id="target-count"
                      inputMode="numeric"
                      type="number"
                      min="0"
                      max="9999999"
                      placeholder="1500"
                      value={targetCount}
                      onChange={(event) => setTargetCount(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="command-mode">Command Mode</label>
                    <select
                      id="command-mode"
                      value={commandMode}
                      onChange={(event) => setCommandMode(event.target.value as CommandMode)}
                    >
                      <option value="verified">Verified count</option>
                      <option value="test">Test count</option>
                    </select>
                  </div>
                </div>

                <button className="btn btn-primary" type="button" onClick={() => void sendCount(false)}>
                  Send Count To Device
                </button>
                <StatusBox status={status} />

                <h2 className="section-title">Payload Preview</h2>
                <pre className="code">{preview}</pre>
              </section>
            ) : null}

            {activeTab === 'provider' ? (
              <section>
                <h2 className="section-title">Provider Test Mode</h2>
                <p className="subtle">
                  Use this when the prototype firmware is ready to connect to the broker and subscribe to its command topic.
                </p>
                <div style={{ height: 14 }} />
                <pre className="code">{providerSummary(selectedTarget, preview)}</pre>
                <div className="field provider-input">
                  <label htmlFor="provider-count">Provider Test Count</label>
                  <input
                    id="provider-count"
                    inputMode="numeric"
                    type="number"
                    min="0"
                    max="9999999"
                    placeholder="1500"
                    value={providerTargetCount}
                    onChange={(event) => updateProviderCount(event.target.value)}
                  />
                </div>
                <button className="btn btn-primary" type="button" onClick={() => void sendCount(true)}>
                  Send Provider Test Count
                </button>
                <StatusBox status={status} />
              </section>
            ) : null}

            {activeTab === 'protocol' ? (
              <section>
                <h2 className="section-title">Device Protocol</h2>
                <pre className="code">{protocolText}</pre>
              </section>
            ) : null}
          </div>
        </section>

        <aside className="panel right-panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Recent Commands</div>
              <p className="subtle">Client-side history for this browser</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="history">
              {history.length === 0 ? (
                <p className="subtle">No commands sent from this browser yet.</p>
              ) : (
                history.slice(0, 8).map((item, index) => (
                  <div className="history-item" key={`${item.sentAt}-${index}`}>
                    <div className="history-top">
                      <span>{item.mode}</span>
                      <span>{item.status}</span>
                    </div>
                    <div className="target-meta">
                      {item.label} -&gt; {item.target}
                    </div>
                    <div className="target-meta">{item.sentAt}</div>
                  </div>
                ))
              )}
            </div>
            <h3 className="section-title">Provider Checklist</h3>
            <ul className="checklist">
              <li>Firmware connects to the MQTT broker using assigned credentials.</li>
              <li>Device subscribes to its exact devices/{'{deviceId}'}/commands/set-count topic.</li>
              <li>Display moves to the target value without manual reset.</li>
              <li>Device recovers after power loss and reconnects after network interruption.</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <div className="subtle">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function StatusBox({ status }: { status: { message: string; kind: StatusKind } }) {
  return <div className={`status ${status.kind}`.trim()}>{status.message}</div>;
}

function providerSummary(target: PrototypeTarget | undefined, preview: string): string {
  if (!target) {
    return 'Load targets to view provider connection details.';
  }

  return [
    `Device ID: ${target.deviceId}`,
    `Device serial: ${target.deviceSerial}`,
    `MQTT topic: devices/${target.deviceId}/commands/set-count`,
    '',
    preview
  ].join('\n');
}

const protocolText = `Topic:
devices/{deviceId}/commands/set-count

Payload:
{
  "counterId": "counter-id",
  "target": 1500,
  "reason": "verified_count",
  "eventId": "verified-count",
  "sentAt": "2026-05-22T00:00:00.000Z"
}

Expected firmware behavior:
- connect to 2.4GHz WiFi
- connect to MQTT with assigned credentials
- subscribe to the set-count topic
- parse target as a non-negative integer
- animate the split-flap display to target
- ignore duplicate eventId values when possible
- reconnect automatically after WiFi or broker interruption`;
