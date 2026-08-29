import React, { useState, useEffect } from 'react';
import { playAlarmSound, stopAlarmSound } from '../utils/audioManager';

export default function ParentControlCenter({
  users,
  devices,
  displayClients,
  weeklySummary,
  weekOffset,
  onChangeWeekOffset,
  allActiveSessions,
  auditLogs,
  onSelectUser,
  selectedUser,
  onEditDayTime,
  onBankTransaction,
  onCreateUser,
  onCreateDevice,
  onToggleDeviceLock,
  onAssignDevice,
  onAssignDisplayClient,
  onDeleteDisplayClient,
  onRenameDisplayClient,
  onDeleteUser,
  onDeleteDevice,
  onPauseSession,
  onResumeSession,
  onCancelSession,
  onAcknowledgeSession
}) {
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [showEditDayModal, setShowEditDayModal] = useState(false);
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusTargetMinutes, setBonusTargetMinutes] = useState(0);
  const [bonusNote, setBonusNote] = useState('');
  const [clientLogs, setClientLogs] = useState([]);

  const fetchClientLogs = async () => {
    try {
      const res = await fetch('/api/client-logs?limit=50');
      const data = await res.json();
      if (Array.isArray(data)) setClientLogs(data);
    } catch (e) {
      console.warn('Could not fetch client logs:', e);
    }
  };

  const handleClearClientLogs = async () => {
    try {
      await fetch('/api/client-logs', { method: 'DELETE' });
      setClientLogs([]);
    } catch (e) {
      console.warn('Could not clear client logs:', e);
    }
  };

  useEffect(() => {
    fetchClientLogs();
    const interval = setInterval(fetchClientLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  // Check if any child has an unacknowledged expired session
  const expiredSession = (allActiveSessions || []).find((s) => s.status === 'expired');

  // Audio Alarm, Haptic Vibration & Text-To-Speech with Child Name for Parent View
  useEffect(() => {
    if (!expiredSession) return;

    let vibrateInterval = null;
    let speechInterval = null;

    try {
      // 1. Play unlocked mobile HTML5 Audio stream
      playAlarmSound();

      // 2. Mobile Vibration
      if ('vibrate' in navigator) {
        const triggerVibration = () => {
          try {
            navigator.vibrate([500, 250, 500, 250, 500]);
          } catch (e) {}
        };
        triggerVibration();
        vibrateInterval = setInterval(triggerVibration, 3000);
      }

      // 3. Spoken Text-to-Speech (Web Speech API) with Child Name
      if ('speechSynthesis' in window) {
        const speakText = () => {
          try {
            window.speechSynthesis.cancel();
            const childName = expiredSession.user_name || 'Kind';
            const announcement = `Achtung! Die Spielzeit von ${childName} ist abgelaufen! Bitte kontrollieren.`;
            const utterance = new SpeechSynthesisUtterance(announcement);
            utterance.lang = 'de-DE';
            utterance.rate = 0.95;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            window.speechSynthesis.speak(utterance);
          } catch (e) {
            console.error('Speech synthesis error:', e);
          }
        };

        speakText();
        speechInterval = setInterval(speakText, 9000);
      }
    } catch (e) {
      console.error('Audio playback error:', e);
    }

    // Flash tab title
    const originalTitle = document.title;
    let toggle = false;
    const titleInterval = setInterval(() => {
      document.title = toggle
        ? `🚨 ALARM: ${expiredSession.user_name}! 🚨`
        : '🛡️ Eltern-Zentrale';
      toggle = !toggle;
    }, 800);

    return () => {
      if (vibrateInterval) clearInterval(vibrateInterval);
      if (speechInterval) clearInterval(speechInterval);
      if (titleInterval) clearInterval(titleInterval);
      stopAlarmSound();
      document.title = originalTitle || 'ScreenTime Cockpit';
    };
  }, [expiredSession?.id, expiredSession?.user_name, expiredSession?.device_name]);

  const [editingDay, setEditingDay] = useState(null);
  const [editMins, setEditMins] = useState(0);
  const [editDevice, setEditDevice] = useState('-');

  // User edit state
  const [editUserName, setEditUserName] = useState('');
  const [editUserAvatar, setEditUserAvatar] = useState('👦');
  const [editUserBudget, setEditUserBudget] = useState(300);

  // New User state
  const [newUserName, setNewUserName] = useState('');
  const [newUserAvatar, setNewUserAvatar] = useState('👦');
  const [newUserBudget, setNewUserBudget] = useState(300);

  // New Device state
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceType, setNewDeviceType] = useState('Konsole');

  const avatarOptions = ['👦', '👧', '🧒', '🎮', '🚀', '👑', '⭐', '⚽'];

  if (!selectedUser && users.length > 0) {
    onSelectUser(users[0]);
    return <div>Lade Eltern-Zentrale...</div>;
  }

  // Handle completely empty user state
  if (!selectedUser && users.length === 0) {
    return (
      <div className="content-area">
        <div className="profile-card grid-span-full">
          <div className="profile-info">
            <div className="avatar-circle">🛡️</div>
            <div>
              <div className="profile-name">Eltern-Kontrollzentrum</div>
              <div className="profile-subtitle">Noch kein Kind angelegt</div>
            </div>
          </div>
        </div>

        <div className="pin-box" style={{ margin: '20px auto' }}>
          <div className="pin-title">👦 Kind anlegen</div>
          <div className="pin-subtitle">Lege dein erstes Kind an, um Bildschirmzeiten zu verwalten.</div>
          <button className="pill-btn" style={{ margin: '16px auto 0 auto' }} onClick={() => setShowAddUserModal(true)}>
            ➕ Kind anlegen
          </button>
        </div>

        {/* Add User Modal */}
        {showAddUserModal && (
          <div className="modal-overlay">
            <div className="pin-box">
              <div className="pin-title">👦 Neues Kind anlegen</div>
              <div style={{ margin: '16px 0', textAlign: 'left' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Name des Kindes:
                </label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="z. B. Maximilian"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '10px',
                    border: '1px solid var(--card-border)',
                    background: 'var(--card-bg)',
                    color: '#fff',
                    marginBottom: '12px'
                  }}
                />
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Avatar auswählen:
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  {avatarOptions.map((av) => (
                    <button
                      key={av}
                      type="button"
                      style={{
                        padding: '8px',
                        borderRadius: '10px',
                        border: newUserAvatar === av ? '2px solid var(--accent-blue)' : '1px solid var(--card-border)',
                        background: 'var(--card-bg)',
                        fontSize: '1.2rem',
                        cursor: 'pointer'
                      }}
                      onClick={() => setNewUserAvatar(av)}
                    >
                      {av}
                    </button>
                  ))}
                </div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Wöchentliches Basisbudget (Minuten):
                </label>
                <input
                  type="number"
                  value={newUserBudget}
                  onChange={(e) => setNewUserBudget(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '10px',
                    border: '1px solid var(--card-border)',
                    background: 'var(--card-bg)',
                    color: '#fff'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="pill-btn"
                  style={{ flex: 1 }}
                  onClick={() => {
                    if (newUserName.trim()) {
                      onCreateUser(newUserName.trim(), newUserAvatar, parseInt(newUserBudget, 10));
                      setNewUserName('');
                      setShowAddUserModal(false);
                    }
                  }}
                >
                  Speichern
                </button>
                <button className="pill-btn pill-btn-danger" style={{ flex: 1 }} onClick={() => setShowAddUserModal(false)}>
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const userDevices = devices.filter((d) => d.assigned_user_id === selectedUser.id);

  const handleOpenEditUser = () => {
    setEditUserName(selectedUser.name);
    setEditUserAvatar(selectedUser.avatar_id || '👦');
    setEditUserBudget(selectedUser.weekly_budget_minutes || 300);
    setShowEditUserModal(true);
  };

  const handleSaveEditUser = () => {
    if (editUserName.trim()) {
      onCreateUser(editUserName.trim(), editUserAvatar, parseInt(editUserBudget, 10), selectedUser.id);
      setShowEditUserModal(false);
    }
  };

  const handleDeleteChild = () => {
    if (confirm(`Möchtest du Kind "${selectedUser.name}" wirklich löschen?`)) {
      onDeleteUser(selectedUser.id);
    }
  };

  const handleOpenEditDay = (row) => {
    setEditingDay(row);
    setEditMins(row.minutes);
    setEditDevice(row.device !== '-' ? row.device : (userDevices[0] ? userDevices[0].name : '-'));
    setShowEditDayModal(true);
  };

  const handleSaveEditDay = () => {
    if (editingDay) {
      const mins = parseInt(editMins, 10) || 0;
      onEditDayTime(selectedUser.id, editingDay.dateStr, mins, editDevice);
      setShowEditDayModal(false);
    }
  };

  const handleOpenBonusModal = () => {
    setBonusTargetMinutes(selectedUser?.bonusBalance ?? 0);
    setBonusNote('');
    setShowBonusModal(true);
  };

  const handleSaveBonusOverride = () => {
    if (selectedUser) {
      const targetMins = parseInt(bonusTargetMinutes, 10);
      onBankTransaction(selectedUser.id, null, bonusNote || 'Bonus-Guthaben Korrektur', isNaN(targetMins) ? 0 : targetMins);
      setShowBonusModal(false);
    }
  };

  const handleSaveNewUser = () => {
    if (newUserName.trim()) {
      onCreateUser(newUserName.trim(), newUserAvatar, parseInt(newUserBudget, 10));
      setNewUserName('');
      setShowAddUserModal(false);
    }
  };

  const handleSaveNewDevice = () => {
    if (newDeviceName.trim()) {
      onCreateDevice(newDeviceName.trim(), newDeviceType, selectedUser.id);
      setNewDeviceName('');
      setShowAddDeviceModal(false);
    }
  };

  return (
    <div className="content-area">
      {/* Header Profile Card */}
      <div
        className="profile-card grid-span-full"
        style={{
          background: 'linear-gradient(135deg, #2d2011 0%, #181a24 100%)',
          borderColor: 'rgba(251, 191, 36, 0.3)',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '12px',
          padding: '12px 10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            className="avatar-circle"
            style={{
              width: '42px',
              height: '42px',
              fontSize: '1.3rem',
              background: 'radial-gradient(circle, #f59e0b 0%, #b45309 100%)',
              boxShadow: '0 4px 10px rgba(245, 158, 11, 0.4)'
            }}
          >
            🛡️
          </div>
          <div>
            <div className="profile-name" style={{ fontSize: '1.15rem', fontWeight: 800 }}>Eltern-Kontrollzentrum</div>
            <div className="profile-subtitle">Direkte Korrektur von Zeit, Namen & Geräten</div>
          </div>
        </div>

        <a
          href="/screentime.apk"
          download="screentime.apk"
          className="pill-btn"
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.8rem',
            padding: '8px 12px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          📱 Android App (.APK) herunterladen
        </a>
      </div>

      {/* Live Monitor Grid for All Children */}
      <div className="grid-span-full">
        <div className="section-title">📡 Live-Übersicht aller Kinder (Echtzeit-Monitor)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
          {users.map((u) => {
            const userSession = (allActiveSessions || []).find((s) => s.user_id === u.id);
            const isExpired = userSession && userSession.status === 'expired';
            const isActive = userSession && userSession.status === 'active';
            const isPaused = userSession && userSession.status === 'paused';

            let mins = 0;
            let secs = 0;
            let timeStr = '00:00';
            if (userSession) {
              mins = Math.floor(userSession.remaining_seconds / 60);
              secs = userSession.remaining_seconds % 60;
              timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }

            return (
              <div
                key={u.id}
                style={{
                  background: isExpired
                    ? 'rgba(239, 68, 68, 0.15)'
                    : isActive
                    ? 'rgba(99, 102, 241, 0.12)'
                    : 'var(--card-bg)',
                  border: isExpired
                    ? '2px solid var(--accent-red)'
                    : isActive
                    ? '1px solid var(--accent-blue)'
                    : '1px solid var(--card-border)',
                  borderRadius: '18px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  boxShadow: isExpired ? '0 0 20px rgba(239, 68, 68, 0.4)' : undefined,
                  animation: isExpired ? 'pulse 1.2s infinite' : undefined
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.95rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>{u.avatar_id || '👦'}</span> {u.name}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                    🐷 {u.balance || 0} Min
                  </div>
                </div>

                {/* Session Status & Live Timer */}
                {isExpired ? (
                  <div style={{ background: 'rgba(239,68,68,0.2)', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--accent-red)', fontWeight: 800, fontSize: '1rem' }}>
                      🚨 ZEIT ABGELAUFEN!
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#fca5a5', marginTop: '2px' }}>
                      Gerät: <b>{userSession.device_name}</b>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                      <button
                        className="pill-btn"
                        style={{ background: 'var(--accent-red)', color: '#fff', flex: 1, fontSize: '0.75rem', padding: '6px' }}
                        onClick={() => onAcknowledgeSession(userSession.id, 'parent')}
                      >
                        🔔 Alarm beenden
                      </button>
                      <button
                        className="pill-btn"
                        style={{ background: 'var(--accent-blue)', color: '#fff', flex: 1, fontSize: '0.75rem', padding: '6px' }}
                        onClick={() => onBankTransaction(u.id, 15, '+15 Min Bonus bei Ablauf')}
                      >
                        🎁 +15 Min
                      </button>
                    </div>
                  </div>
                ) : isActive ? (
                  <div style={{ background: 'rgba(99,102,241,0.15)', padding: '10px', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                        💻 <b>{userSession.device_name}</b>
                      </span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 800, color: mins <= 10 ? 'var(--accent-yellow)' : 'var(--accent-green)' }}>
                        ⏱️ {timeStr} Min
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      <button
                        className="btn-quick"
                        style={{ flex: 1, fontSize: '0.72rem', padding: '6px' }}
                        onClick={() => onPauseSession(userSession.id)}
                      >
                        ⏸️ Pause
                      </button>
                      <button
                        className="btn-quick"
                        style={{ flex: 1, fontSize: '0.72rem', padding: '6px', background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}
                        onClick={() => onCancelSession(userSession.id, 'parent')}
                      >
                        🛑 Stopp
                      </button>
                      <button
                        className="btn-quick"
                        style={{ flex: 1, fontSize: '0.72rem', padding: '6px', background: 'rgba(16,185,129,0.2)', color: '#6ee7b7' }}
                        onClick={() => onBankTransaction(u.id, 15, '+15 Min Bonus während Spielzeit')}
                      >
                        +15m
                      </button>
                    </div>
                  </div>
                ) : isPaused ? (
                  <div style={{ background: 'rgba(245,158,11,0.15)', padding: '10px', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                        💻 <b>{userSession.device_name}</b> (Pausiert)
                      </span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-yellow)' }}>
                        ⏸️ {timeStr}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      <button
                        className="btn-quick"
                        style={{ flex: 1, fontSize: '0.72rem', padding: '6px' }}
                        onClick={() => onResumeSession(userSession.id)}
                      >
                        ▶️ Weiter
                      </button>
                      <button
                        className="btn-quick"
                        style={{ flex: 1, fontSize: '0.72rem', padding: '6px', background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}
                        onClick={() => onCancelSession(userSession.id, 'parent')}
                      >
                        🛑 Stopp
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '4px 0' }}>
                    ⚪ Spielfrei (Keine aktive Sitzung)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Left Column: Managed Child Switcher, Editable Table, Bank */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Child Selector */}
        <div>
          <div className="section-title">Verwaltetes Kind auswählen</div>
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

        {/* Editable Weekly Table for selected child (Mo-So absteigend) */}
        <div>
          <div className="week-header-bar">
            <div className="section-title" style={{ margin: 0 }}>📊 Wochenkorrektur ({selectedUser.name})</div>
            <div className="week-nav-controls">
              <button
                className="week-nav-btn"
                onClick={() => onChangeWeekOffset((weekOffset || 0) - 1)}
                title="Vorherige Woche"
              >
                ◀
              </button>
              <span className="week-kw-badge">
                {weeklySummary ? weeklySummary.kwLabel.replace(/\.20\d\d/g, '').replace(/\s*-\s*/, '-') : 'Lade...'}
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
                  <th style={{ width: '27%' }}>Tag</th>
                  <th style={{ width: '31%' }}>Gerät</th>
                  <th style={{ width: '18%', textAlign: 'right' }}>Dauer</th>
                  <th style={{ width: '24%', textAlign: 'right' }}>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {weeklySummary && weeklySummary.rows ? (
                  weeklySummary.rows.map((row) => (
                    <tr key={row.dateStr} className={row.isToday ? 'highlight-row' : ''}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className={`day-badge ${row.isToday ? 'active' : ''}`}>{row.dayName}</span>
                        <span style={{ fontSize: '0.72rem' }}>
                          {row.displayDate.replace(`${row.dayName} `, '').replace(/\.20\d\d/, '.')}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.7rem', lineHeight: '1.2' }}>
                        {row.device && row.device !== '-' ? (
                          row.device.split(', ').map((d, idx) => (
                            <div key={idx} style={{ marginBottom: idx > 0 ? '2px' : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <b>{d}</b>
                            </div>
                          ))
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <b style={{ fontSize: '0.74rem' }}>{row.minutes} Min</b>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn-table-edit"
                          onClick={() => handleOpenEditDay(row)}
                          style={{ padding: '3px 5px', fontSize: '0.66rem' }}
                        >
                          ✏️ Ändern
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4">Lade Tabelle...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bonus-Guthaben Management */}
        <div className="parent-controls">
          <div className="section-title">🎁 Bonusguthaben verwalten ({selectedUser.name})</div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Aktuelles Bonusguthaben</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-gold)' }}>
                  {selectedUser.bonusBalance !== undefined ? selectedUser.bonusBalance : 0} Min 🎁
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Verbleibendes Wochenguthaben</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#60a5fa' }}>
                  {selectedUser.weeklyBalance !== undefined ? selectedUser.weeklyBalance : selectedUser.balance} Min 📅
                </div>
              </div>
            </div>
            <button
              className="pill-btn"
              style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#fff' }}
              onClick={handleOpenBonusModal}
            >
              ✏️ Bonusguthaben korrigieren / anpassen
            </button>
          </div>
        </div>
      </div>

      {/* Bonus Override Modal */}
      {showBonusModal && selectedUser && (
        <div className="modal-overlay">
          <div className="pin-box">
            <div className="pin-title">🎁 Bonusguthaben anpassen</div>
            <div className="pin-subtitle">Kind: <b>{selectedUser.name}</b> (Aktuell: {selectedUser.bonusBalance || 0} Min)</div>

            <div style={{ margin: '16px 0', textAlign: 'left' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Neues Bonusguthaben (Minuten):
              </label>
              <input
                type="number"
                value={bonusTargetMinutes}
                onChange={(e) => setBonusTargetMinutes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid var(--card-border)',
                  background: 'var(--card-bg)',
                  color: '#fff',
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  textAlign: 'center',
                  marginBottom: '12px'
                }}
              />

              <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                {[-30, -15, 15, 30, 60].map((adj) => (
                  <button
                    key={adj}
                    type="button"
                    className="btn-quick"
                    style={{ flex: 1, padding: '6px', fontSize: '0.75rem' }}
                    onClick={() => {
                      const current = parseInt(bonusTargetMinutes, 10) || 0;
                      setBonusTargetMinutes(Math.max(0, current + adj));
                    }}
                  >
                    {adj > 0 ? `+${adj}` : adj}m
                  </button>
                ))}
              </div>

              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Begründung / Notiz (optional):
              </label>
              <input
                type="text"
                value={bonusNote}
                onChange={(e) => setBonusNote(e.target.value)}
                placeholder="z. B. Belohnung für Zimmer aufräumen"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--card-border)',
                  background: 'var(--card-bg)',
                  color: '#fff'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="pill-btn" style={{ flex: 1 }} onClick={handleSaveBonusOverride}>
                💾 Speichern
              </button>
              <button className="pill-btn pill-btn-danger" style={{ flex: 1 }} onClick={() => setShowBonusModal(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right Column: Master Data Management & Audit Protocol Log */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Master Data & Device Management */}
        <div className="parent-controls">
          <div className="section-title">⚙️ Kinder & Geräte verwalten</div>
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              borderRadius: '16px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                paddingBottom: '10px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                    {selectedUser.avatar_id} {selectedUser.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Basis-Budget: {selectedUser.weekly_budget_minutes} Min/Woche
                  </div>
                </div>
                <button
                  className="pill-btn pill-btn-danger"
                  style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                  onClick={handleDeleteChild}
                  title="Kind löschen"
                >
                  🗑️
                </button>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  className="pill-btn"
                  style={{ padding: '6px 10px', fontSize: '0.74rem', flex: 1, minWidth: '120px', justifyContent: 'center' }}
                  onClick={handleOpenEditUser}
                >
                  ✏️ Name/Budget
                </button>
                <button
                  className="pill-btn"
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.74rem',
                    flex: 1,
                    minWidth: '120px',
                    justifyContent: 'center',
                    background: localStorage.getItem('screentime_child_name') === selectedUser.name ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.15)',
                    borderColor: localStorage.getItem('screentime_child_name') === selectedUser.name ? '#10b981' : 'var(--accent-blue)',
                    color: localStorage.getItem('screentime_child_name') === selectedUser.name ? '#6ee7b7' : '#fff'
                  }}
                  onClick={() => {
                    if (localStorage.getItem('screentime_child_name') === selectedUser.name) {
                      localStorage.removeItem('screentime_child_name');
                      alert(`Dieses Gerät ist nicht mehr fest auf ${selectedUser.name} eingestellt.`);
                    } else {
                      localStorage.setItem('screentime_child_name', selectedUser.name);
                      alert(`Dieses Gerät öffnet ab sofort direkt das Cockpit von ${selectedUser.name}!`);
                    }
                    window.location.reload();
                  }}
                  title="Dieses Smartphone/Tablet fest für dieses Kind einstellen"
                >
                  {localStorage.getItem('screentime_child_name') === selectedUser.name
                    ? `📱 Fest: ${selectedUser.name} ✔️`
                    : `📱 Als Festgerät sperren`}
                </button>
              </div>
            </div>

            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginTop: '4px' }}>
              Zugeordnete Geräte ({selectedUser.name}):
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {userDevices.map((d) => (
                <div
                  key={d.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#141620',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '0.8rem'
                  }}
                >
                  <span>
                    {d.type === 'Laptop' ? '💻' : d.type === 'Tablet' ? '📱' : '🎮'} {d.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      style={{
                        background: d.is_locked ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: d.is_locked ? '#fca5a5' : '#6ee7b7',
                        border: `1px solid ${d.is_locked ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                        borderRadius: '6px',
                        padding: '4px 10px',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        transition: 'all 0.2s ease'
                      }}
                      onClick={() => onToggleDeviceLock && onToggleDeviceLock(d.id)}
                      title={d.is_locked ? "Klicken zum Entsperren" : "Klicken zum Sperren"}
                    >
                      {d.is_locked ? '🔒 Gesperrt' : '🟢 Bereit'}
                    </button>
                    <button
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-red)',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                      onClick={() => confirm(`Gerät "${d.name}" löschen?`) && onDeleteDevice(d.id)}
                      title="Gerät löschen"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>



            {/* 2. Anzeige-Smartphones & Cockpit Displays Section */}
            <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-gold)', marginBottom: '4px' }}>
                📱 Anzeige-Smartphones & Cockpit-Displays ({displayClients?.length || 0}):
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Telefone/Displays, die die App anzeigen. Bestimme hier zentral, welches Kind-Cockpit dort zu sehen ist:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {displayClients && displayClients.length > 0 ? (
                  displayClients.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#12141c',
                        border: '1px solid var(--card-border)',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        fontSize: '0.78rem',
                        flexWrap: 'wrap',
                        gap: '6px'
                      }}
                    >
                      <div style={{ minWidth: '110px', flex: 1 }}>
                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📱 {c.client_name}</span>
                          <button
                            type="button"
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
                            onClick={() => {
                              const newName = prompt('Gerätenamen anpassen (z. B. Galaxy A52 / Wohnzimmer):', c.client_name);
                              if (newName && newName.trim()) {
                                onRenameDisplayClient && onRenameDisplayClient(c.id, newName.trim());
                              }
                            }}
                            title="Name anpassen"
                          >
                            ✏️
                          </button>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {c.assigned_user_name ? `Cockpit: ${c.assigned_user_name}` : '🌐 Hauptansicht'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <select
                          value={c.assigned_user_id || ''}
                          onChange={(e) => onAssignDisplayClient && onAssignDisplayClient(c.id, e.target.value)}
                          style={{
                            background: '#1e2230',
                            border: '1px solid var(--card-border)',
                            color: '#fff',
                            borderRadius: '6px',
                            padding: '4px 6px',
                            fontSize: '0.72rem',
                            maxWidth: '135px'
                          }}
                        >
                          <option value="">🌐 Alle</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>👦 {u.name}</option>
                          ))}
                        </select>

                        <button
                          type="button"
                          style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '0.85rem' }}
                          onClick={() => confirm(`Anzeige-Gerät "${c.client_name}" entfernen?`) && onDeleteDisplayClient && onDeleteDisplayClient(c.id)}
                          title="Gerät aus Liste entfernen"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Noch keine Anzeige-Smartphones verbunden. Sobald die App auf einem Handy geöffnet wird, erscheint es hier automatisch.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                className="btn-quick"
                style={{ flex: 1, fontSize: '0.78rem', padding: '10px' }}
                onClick={() => setShowAddUserModal(true)}
              >
                ➕ Neues Kind
              </button>
              <button
                className="btn-quick"
                style={{ flex: 1, fontSize: '0.78rem', padding: '10px' }}
                onClick={() => setShowAddDeviceModal(true)}
              >
                🎮 Neues Gerät
              </button>
            </div>
          </div>
        </div>

        {/* Audit Log Timeline */}
        <div>
          <div className="section-title">Revisionssicheres Audit-Protokoll</div>
          <div className="timeline-list">
            {auditLogs && auditLogs.length > 0 ? (
              auditLogs.slice(0, 10).map((log) => {
                const date = new Date(log.timestamp * 1000);
                const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} Uhr`;
                const badgeClass =
                  log.actor_role === 'parent'
                    ? 'badge-parent'
                    : log.actor_role === 'child'
                    ? 'badge-child'
                    : 'badge-system';
                const badgeIcon = log.actor_role === 'parent' ? '🛡️' : log.actor_role === 'child' ? '👤' : '🔴';

                return (
                  <div key={log.id} className="timeline-item">
                    <div className={`timeline-badge ${badgeClass}`}>{badgeIcon}</div>
                    <div className="timeline-details">
                      <div className="timeline-time">{timeStr}</div>
                      <div className="timeline-text">{log.detailsObj.message || log.details}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Keine Log-Einträge vorhanden</div>
            )}
          </div>

          {/* Smartphone Remote-Telemetry Logs (Live Mobile Lockscreen Diagnostics) */}
          <div style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div className="section-title" style={{ margin: 0 }}>📱 Smartphone Remote-Telemetry (Live-Diagnose)</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="week-today-btn"
                  onClick={fetchClientLogs}
                  title="Logs aktualisieren"
                >
                  🔄
                </button>
                <button
                  type="button"
                  className="week-today-btn"
                  onClick={handleClearClientLogs}
                  style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}
                  title="Logs leeren"
                >
                  🗑️
                </button>
              </div>
            </div>

            <div className="timeline-list" style={{ maxHeight: '280px', overflowY: 'auto' }}>
              {clientLogs && clientLogs.length > 0 ? (
                clientLogs.map((clog) => {
                  const date = new Date(clog.timestamp * 1000);
                  const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
                  const isError = clog.log_level === 'ERROR' || clog.category.includes('Error') || clog.category.includes('Blocked');
                  const isWarn = clog.log_level === 'WARN' || clog.category.includes('Lock') || clog.category.includes('Visibility');

                  const badgeClass = isError ? 'badge-system' : isWarn ? 'badge-child' : 'badge-parent';
                  const badgeIcon = isError ? '❌' : isWarn ? '⚠️' : '📱';

                  return (
                    <div key={clog.id} className="timeline-item">
                      <div className={`timeline-badge ${badgeClass}`}>{badgeIcon}</div>
                      <div className="timeline-details">
                        <div className="timeline-time">
                          {timeStr} • <span style={{ color: 'var(--accent-blue)' }}>{clog.child_name || 'Kind'}</span> • <b>{clog.category}</b>
                        </div>
                        <div className="timeline-text" style={{ color: isError ? '#f87171' : 'var(--text-color)' }}>
                          {clog.message}
                        </div>
                        {clog.details && clog.details !== 'null' && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                            {clog.details}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '12px' }}>
                  Noch keine Smartphone-Telemetrie-Logs empfangen. Starte eine Sitzung auf dem Handy, um Ereignisse live aufzuzeichnen.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit User Modal (Name, Avatar, Budget) */}
      {showEditUserModal && (
        <div className="modal-overlay">
          <div className="pin-box">
            <div className="pin-title">✏️ Kind bearbeiten</div>
            <div style={{ margin: '16px 0', textAlign: 'left' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Name des Kindes:
              </label>
              <input
                type="text"
                value={editUserName}
                onChange={(e) => setEditUserName(e.target.value)}
                placeholder="Name anpassen..."
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--card-border)',
                  background: 'var(--card-bg)',
                  color: '#fff',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  marginBottom: '12px'
                }}
              />

              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Avatar wählen:
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {avatarOptions.map((av) => (
                  <button
                    key={av}
                    type="button"
                    style={{
                      padding: '8px',
                      borderRadius: '10px',
                      border: editUserAvatar === av ? '2px solid var(--accent-blue)' : '1px solid var(--card-border)',
                      background: 'var(--card-bg)',
                      fontSize: '1.2rem',
                      cursor: 'pointer'
                    }}
                    onClick={() => setEditUserAvatar(av)}
                  >
                    {av}
                  </button>
                ))}
              </div>

              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Wöchentliches Basisbudget (Minuten):
              </label>
              <input
                type="number"
                value={editUserBudget}
                onChange={(e) => setEditUserBudget(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--card-border)',
                  background: 'var(--card-bg)',
                  color: '#fff',
                  fontSize: '1.1rem',
                  fontWeight: 700
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="pill-btn" style={{ flex: 1 }} onClick={handleSaveEditUser}>
                Speichern
              </button>
              <button className="pill-btn pill-btn-danger" style={{ flex: 1 }} onClick={() => setShowEditUserModal(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day Time & Device Edit Modal */}
      {showEditDayModal && editingDay && (
        <div className="modal-overlay">
          <div className="pin-box">
            <div className="pin-title">✏️ Tageseintrag korrigieren</div>
            <div className="pin-subtitle">Tag: <b>{editingDay.displayDate}</b> ({selectedUser.name})</div>

            <div style={{ margin: '16px 0', textAlign: 'left' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Gerät auswählen:
              </label>
              <select
                value={editDevice}
                onChange={(e) => setEditDevice(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--card-border)',
                  background: 'var(--card-bg)',
                  color: '#fff',
                  marginBottom: '12px'
                }}
              >
                <option value="-">- Kein Gerät / Spielfrei -</option>
                {userDevices.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name} ({d.type})
                  </option>
                ))}
              </select>

              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Dauer (Minuten):
              </label>
              <input
                type="number"
                value={editMins}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setEditMins('');
                  } else {
                    const num = parseInt(val, 10);
                    setEditMins(isNaN(num) ? '' : Math.max(0, num));
                  }
                }}
                onBlur={() => {
                  if (editMins === '') setEditMins(0);
                }}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--card-border)',
                  background: 'var(--card-bg)',
                  color: '#fff',
                  fontSize: '1.1rem',
                  fontWeight: 700
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="pill-btn" style={{ flex: 1 }} onClick={handleSaveEditDay}>
                Speichern
              </button>
              <button className="pill-btn pill-btn-danger" style={{ flex: 1 }} onClick={() => setShowEditDayModal(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="modal-overlay">
          <div className="pin-box">
            <div className="pin-title">👦 Neues Kind anlegen</div>
            <div style={{ margin: '16px 0', textAlign: 'left' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Name:
              </label>
              <input
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="z. B. Maximilian"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--card-border)',
                  background: 'var(--card-bg)',
                  color: '#fff',
                  marginBottom: '12px'
                }}
              />
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Avatar auswählen:
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {avatarOptions.map((av) => (
                  <button
                    key={av}
                    type="button"
                    style={{
                      padding: '8px',
                      borderRadius: '10px',
                      border: newUserAvatar === av ? '2px solid var(--accent-blue)' : '1px solid var(--card-border)',
                      background: 'var(--card-bg)',
                      fontSize: '1.2rem',
                      cursor: 'pointer'
                    }}
                    onClick={() => setNewUserAvatar(av)}
                  >
                    {av}
                  </button>
                ))}
              </div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Wöchentliches Basisbudget (Minuten):
              </label>
              <input
                type="number"
                value={newUserBudget}
                onChange={(e) => setNewUserBudget(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--card-border)',
                  background: 'var(--card-bg)',
                  color: '#fff'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="pill-btn" style={{ flex: 1 }} onClick={handleSaveNewUser}>
                Speichern
              </button>
              <button className="pill-btn pill-btn-danger" style={{ flex: 1 }} onClick={() => setShowAddUserModal(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Device Modal */}
      {showAddDeviceModal && (
        <div className="modal-overlay">
          <div className="pin-box">
            <div className="pin-title">🎮 Neues Gerät anlegen</div>
            <div style={{ margin: '16px 0', textAlign: 'left' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Gerätename:
              </label>
              <input
                type="text"
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
                placeholder="z. B. Nintendo Switch"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--card-border)',
                  background: 'var(--card-bg)',
                  color: '#fff',
                  marginBottom: '12px'
                }}
              />
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Typ:
              </label>
              <select
                value={newDeviceType}
                onChange={(e) => setNewDeviceType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--card-border)',
                  background: 'var(--card-bg)',
                  color: '#fff'
                }}
              >
                <option value="Konsole">Konsole</option>
                <option value="Laptop">Laptop</option>
                <option value="Tablet">Tablet</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="pill-btn" style={{ flex: 1 }} onClick={handleSaveNewDevice}>
                Speichern
              </button>
              <button className="pill-btn pill-btn-danger" style={{ flex: 1 }} onClick={() => setShowAddDeviceModal(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
