import React, { useState } from 'react';
import CircularTimer from './CircularTimer';

export default function ChildDashboard({
  users,
  selectedUser,
  onSelectUser,
  devices,
  activeSession,
  weeklySummary,
  weekOffset,
  onChangeWeekOffset,
  onStartSession,
  onPauseSession,
  onResumeSession,
  onCancelSession,
  onAcknowledgeSession,
  isDirectChildLink,
  onOpenParentPinModal
}) {
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [requestedMinutes, setRequestedMinutes] = useState(30);
  const [showModal, setShowModal] = useState(false);

  if (!selectedUser) {
    return (
      <div className="content-area">
        <div className="profile-card grid-span-full">
          <div className="profile-info">
            <div className="avatar-circle">👦</div>
            <div>
              <div className="profile-name">Kind-Ansicht</div>
              <div className="profile-subtitle">Noch kein Kind ausgewählt</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '40px 0', fontSize: '0.9rem' }}>
          Bitte wähle oben ein Kind aus oder schalte in den <b>Eltern-Bereich</b> um, um Kinder anzulegen und Namen anzupassen.
        </div>
      </div>
    );
  }

  const currentBalance = selectedUser.balance || 0;
  const userDevices = devices.filter((d) => d.assigned_user_id === selectedUser.id);

  const handleOpenStartModal = (device) => {
    setSelectedDevice(device);
    setRequestedMinutes(30);
    setShowModal(true);
  };

  const handleConfirmStart = () => {
    if (selectedDevice) {
      const mins = parseInt(requestedMinutes, 10) || 15;
      onStartSession(selectedUser.id, selectedDevice.id, mins, 'child');
      setShowModal(false);
    }
  };

  return (
    <div className="content-area">
      {/* Child Selector Chips (hidden in direct child link mode) */}
      {!isDirectChildLink && (
        <div className="grid-span-full">
          <div className="section-title">Kind auswählen</div>
          <div className="child-selector-bar">
            {users.map((u) => (
              <button
                key={u.id}
                className={`child-chip ${u.id === selectedUser.id ? 'active' : ''}`}
                onClick={() => onSelectUser(u)}
              >
                <span>{u.avatar_id || '👦'}</span> {u.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Profile & Savings Card - Full Width Stretched */}
      <div
        className="profile-card grid-span-full"
        style={{
          width: '100%',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '16px',
          padding: '20px'
        }}
      >
        {/* Child Profile Info Header */}
        <div className="profile-info" style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="avatar-circle" style={{ width: '48px', height: '48px', fontSize: '1.4rem' }}>
              {selectedUser.avatar_id || '👦'}
            </div>
            <div>
              <div className="profile-name" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{selectedUser.name}</div>
              <div className="profile-subtitle">Guthaben-Übersicht</div>
            </div>
          </div>

          <button
            type="button"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--text-muted)',
              borderRadius: '10px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onClick={onOpenParentPinModal}
            title="Eltern-Bereich öffnen (PIN 1307)"
          >
            🛡️ <span style={{ fontSize: '0.72rem' }}>Eltern</span>
          </button>
        </div>

        {/* Full-Width Balance Distribution Bar */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(0, 0, 0, 0.3)',
            padding: '14px 20px',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            gap: '12px'
          }}
        >
          {/* Woche */}
          <div className="savings-badge" style={{ textAlign: 'center', flex: 1, textTransform: 'none' }}>
            <div className="savings-title" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <span>📅</span> <span>Woche</span>
            </div>
            <div className="savings-value" style={{ color: '#60a5fa', fontSize: '1.25rem', fontWeight: 800, justifyContent: 'center', marginTop: '3px' }}>
              <span>{selectedUser.weeklyBalance !== undefined ? selectedUser.weeklyBalance : currentBalance}</span>
              <span style={{ fontSize: '0.8rem', marginLeft: '3px' }}>Min</span>
            </div>
          </div>

          {/* Bonus */}
          <div
            className="savings-badge"
            style={{
              textAlign: 'center',
              flex: 1,
              borderLeft: '1px solid var(--card-border)',
              borderRight: '1px solid var(--card-border)',
              padding: '0 12px',
              textTransform: 'none'
            }}
          >
            <div className="savings-title" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <span>🎁</span> <span>Bonus</span>
            </div>
            <div className="savings-value" style={{ color: '#f59e0b', fontSize: '1.25rem', fontWeight: 800, justifyContent: 'center', marginTop: '3px' }}>
              <span>{selectedUser.bonusBalance !== undefined ? selectedUser.bonusBalance : 0}</span>
              <span style={{ fontSize: '0.8rem', marginLeft: '3px' }}>Min</span>
            </div>
          </div>

          {/* Gesamt */}
          <div className="savings-badge" style={{ textAlign: 'center', flex: 1, textTransform: 'none' }}>
            <div className="savings-title" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <span>🐷</span> <span>Gesamt</span>
            </div>
            <div className="savings-value" style={{ color: 'var(--accent-gold)', fontSize: '1.35rem', fontWeight: 800, justifyContent: 'center', marginTop: '3px' }}>
              <span>{selectedUser.totalBalance !== undefined ? selectedUser.totalBalance : currentBalance}</span>
              <span style={{ fontSize: '0.85rem', marginLeft: '3px' }}>Min</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Timer or Devices Grid */}
      {activeSession ? (
        <div className="grid-span-full">
          <CircularTimer
            childName={selectedUser.name}
            deviceLabel={activeSession.device_name}
            secondsRemaining={activeSession.remaining_seconds}
            totalDurationMinutes={activeSession.duration_minutes}
            isPaused={activeSession.status === 'paused'}
            status={activeSession.status}
            sessionId={activeSession.id}
            expiresAt={activeSession.expires_at}
            onTogglePause={() =>
              activeSession.status === 'paused'
                ? onResumeSession(activeSession.id)
                : onPauseSession(activeSession.id)
            }
            onCancel={() => onCancelSession(activeSession.id, 'child')}
            onAcknowledge={() => onAcknowledgeSession(activeSession.id, 'child')}
          />
        </div>
      ) : null}

      {/* Device Selector Cards */}
      <div>
        <div className="section-title">Geräte auswählen & starten</div>
        <div className="devices-grid">
          {userDevices.length > 0 ? (
            userDevices.map((dev) => (
              <div
                key={dev.id}
                className={`device-card ${activeSession && activeSession.device_id === dev.id ? 'active' : ''}`}
                onClick={() => !activeSession && handleOpenStartModal(dev)}
              >
                <div className="device-icon">
                  {dev.type === 'Laptop' ? '💻' : dev.type === 'Tablet' ? '📱' : '🎮'}
                </div>
                <div className="device-name">{dev.name}</div>
                <div className="device-status">
                  {activeSession && activeSession.device_id === dev.id
                    ? '● Läuft gerade'
                    : dev.is_locked
                    ? '🔴 Gesperrt'
                    : 'Bereit'}
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Keine Geräte zugewiesen</div>
          )}
        </div>
      </div>

      {/* Read-only Weekly Table (Wochenübersicht Mo-So, absteigend sortiert) */}
      <div>
        <div className="week-header-bar">
          <div className="section-title" style={{ margin: 0 }}>📊 Wochenübersicht</div>
          <div className="week-nav-controls">
            <button
              className="week-nav-btn"
              onClick={() => onChangeWeekOffset((weekOffset || 0) - 1)}
              title="Vorherige Woche"
            >
              ◀
            </button>
            <span className="week-kw-badge">
              {weeklySummary ? weeklySummary.kwLabel : 'Lade...'}
            </span>
            <button
              className="week-nav-btn"
              onClick={() => onChangeWeekOffset((weekOffset || 0) + 1)}
              title="Nächste Woche"
            >
              ▶
            </button>
            {(weekOffset !== 0 && weekOffset !== undefined) && (
              <button
                className="week-today-btn"
                onClick={() => onChangeWeekOffset(0)}
                title="Zur aktuellen Woche"
              >
                Heute
              </button>
            )}
          </div>
        </div>
        <div className="weekly-table-card">
          <table className="weekly-table">
            <thead>
              <tr>
                <th style={{ width: '26%' }}>Tag</th>
                <th style={{ width: '34%' }}>Gerät</th>
                <th style={{ width: '18%', textAlign: 'right' }}>Dauer</th>
                <th style={{ width: '22%', textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {weeklySummary && weeklySummary.rows ? (
                weeklySummary.rows.map((row) => (
                  <tr key={row.dateStr} className={row.isToday ? 'highlight-row' : ''}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className={`day-badge ${row.isToday ? 'active' : ''}`}>{row.dayName}</span>
                      <span style={{ fontSize: '0.74rem' }}>{row.displayDate.replace(`${row.dayName} `, '')}</span>
                    </td>
                    <td style={{ fontSize: '0.72rem', lineHeight: '1.25' }}>
                      {row.device && row.device !== '-' ? (
                        row.device.split(', ').map((d, idx) => (
                          <div key={idx} style={{ marginBottom: idx > 0 ? '2px' : 0 }}>
                            {d}
                          </div>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <b style={{ fontSize: '0.76rem' }}>{row.minutes} Min</b>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>
                      <span className={`status-dot ${row.statusColor}`} /> {row.status}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4">Lade Übersicht...</td>
                </tr>
              )}
            </tbody>
          </table>

          {weeklySummary && (
            <div className="weekly-summary-footer">
              <div>
                Wochenverbrauch: <b>{weeklySummary.totalWeekUsed} Min</b> / {weeklySummary.totalBalance} Min Sparguthaben
              </div>
              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${Math.min(
                      100,
                      (weeklySummary.totalWeekUsed / (weeklySummary.weeklyBudget || 300)) * 100
                    )}%`
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Start Session Request Modal */}
      {showModal && selectedDevice && (
        <div className="modal-overlay">
          <div className="pin-box">
            <div className="pin-title">🎮 Spielzeit starten</div>
            <div className="pin-subtitle">
              Gerät: <b>{selectedDevice.name}</b> (Guthaben: {currentBalance} Min)
            </div>

            <div style={{ margin: '20px 0' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                Gewünschte Dauer (Minuten):
              </label>
              <input
                type="number"
                value={requestedMinutes}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setRequestedMinutes('');
                  } else {
                    const num = parseInt(val, 10);
                    setRequestedMinutes(isNaN(num) ? '' : Math.max(1, num));
                  }
                }}
                onBlur={() => {
                  if (requestedMinutes === '' || requestedMinutes < 1) {
                    setRequestedMinutes(15);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid var(--card-border)',
                  background: 'var(--card-bg)',
                  color: '#fff',
                  fontSize: '1.2rem',
                  textAlign: 'center',
                  fontWeight: 700
                }}
              />

              {/* Quick Preset Buttons */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                {[10, 15, 30, 45, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="btn-quick"
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '0.8rem',
                      background: requestedMinutes === m ? 'rgba(99, 102, 241, 0.25)' : undefined,
                      borderColor: requestedMinutes === m ? 'var(--accent-blue)' : undefined
                    }}
                    onClick={() => setRequestedMinutes(m)}
                  >
                    {m} Min
                  </button>
                ))}
              </div>

              {requestedMinutes !== '' && parseInt(requestedMinutes, 10) > currentBalance && (
                <div style={{ color: 'var(--accent-yellow)', fontSize: '0.78rem', marginTop: '8px' }}>
                  ⚠️ Hinweis: Dein Guthaben beträgt nur {currentBalance} Min. Der Server deckelt die Laufzeit
                  automatisch auf {currentBalance} Min!
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="pill-btn" style={{ flex: 1 }} onClick={handleConfirmStart}>
                🚀 Starten
              </button>
              <button
                className="pill-btn pill-btn-danger"
                style={{ flex: 1 }}
                onClick={() => setShowModal(false)}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
