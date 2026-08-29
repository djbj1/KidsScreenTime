import React, { useState, useEffect } from 'react';
import ChildDashboard from './components/ChildDashboard';
import ParentControlCenter from './components/ParentControlCenter';
import PinModal from './components/PinModal';
import { scheduleNativeTimerAlarm, cancelNativeTimerAlarm, clearAllDeliveredNotifications } from './utils/nativeNotifications';

export default function App() {
  const [currentTab, setCurrentTab] = useState('child'); // 'child' | 'parent'
  const [showPinModal, setShowPinModal] = useState(false);
  const [isPinUnlocked, setIsPinUnlocked] = useState(false);

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [allActiveSessions, setAllActiveSessions] = useState([]);
  const [weeklySummary, setWeeklySummary] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isDirectChildLink, setIsDirectChildLink] = useState(false);

  // Initial URL / localStorage check for /eltern vs /Kindname direct link
  useEffect(() => {
    const pathSegment = decodeURIComponent(window.location.pathname.replace(/^\/+/, '')).trim();
    const savedChildName = localStorage.getItem('screentime_child_name');

    if (pathSegment.toLowerCase() === 'eltern' || pathSegment.toLowerCase() === 'parent') {
      setShowPinModal(true);
      setIsDirectChildLink(false);
    } else if (pathSegment || savedChildName) {
      setIsDirectChildLink(true);
    } else {
      setIsDirectChildLink(false);
    }
  }, []);

  // Fetch initial & recurring data
  const fetchData = async () => {
    try {
      // 1. Fetch Users
      const resUsers = await fetch('/api/users');
      const usersData = await resUsers.json();
      setUsers(usersData);

      // Path-based or localStorage-based routing (e.g. /Samuel, /Aljoscha or saved child)
      const pathSegment = decodeURIComponent(window.location.pathname.replace(/^\/+/, '')).trim();
      const savedChildName = localStorage.getItem('screentime_child_name');
      const childQuery = (pathSegment && pathSegment.toLowerCase() !== 'eltern' && pathSegment.toLowerCase() !== 'parent')
        ? pathSegment
        : savedChildName;

      let targetUser = selectedUser;
      if (childQuery) {
        const matchedUser = usersData.find(
          (u) => u.name.toLowerCase() === childQuery.toLowerCase()
        );
        if (matchedUser && (!selectedUser || selectedUser.id !== matchedUser.id)) {
          targetUser = matchedUser;
          setSelectedUser(matchedUser);
        }
      }

      // Select default user if not set
      if (!targetUser && usersData.length > 0) {
        targetUser = usersData[0];
        setSelectedUser(usersData[0]);
      } else if (targetUser) {
        // Update balance from fresh list
        const updated = usersData.find((u) => u.id === targetUser.id);
        if (updated) setSelectedUser(updated);
      }

      // 2. Fetch Devices
      const resDevices = await fetch('/api/devices');
      const devicesData = await resDevices.json();
      setDevices(devicesData);

      // 3. Fetch All Active Sessions for parent monitor
      const resAllSessions = await fetch('/api/sessions/active?all=true');
      const allSessionsData = await resAllSessions.json();
      setAllActiveSessions(Array.isArray(allSessionsData) ? allSessionsData : []);

      // 4. Fetch Active Session for selected user (Child View)
      if (targetUser) {
        const resSession = await fetch(`/api/sessions/active?user_id=${targetUser.id}`);
        const sessionData = await resSession.json();
        setActiveSession(sessionData.active ? sessionData.session : null);

        // 5. Fetch Weekly Summary with weekOffset
        const resSummary = await fetch(`/api/users/${targetUser.id}/weekly-summary?weekOffset=${weekOffset}`);
        const summaryData = await resSummary.json();
        setWeeklySummary(summaryData);
      }

      // 6. Fetch Audit Logs
      const resLogs = await fetch('/api/audit-logs');
      const logsData = await resLogs.json();
      setAuditLogs(logsData);

      // 7. Fetch Display Clients (Smartphones displaying the app)
      const resDisplayClients = await fetch('/api/display-clients');
      const displayClientsData = await resDisplayClients.json();
      setDisplayClients(Array.isArray(displayClientsData) ? displayClientsData : []);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2500); // Poll every 2.5s for real-time updates
    return () => clearInterval(interval);
  }, [selectedUser?.id, weekOffset]);

  // Central Native Notification Scheduler for ALL active sessions (Samuel, Aljoscha, etc.)
  useEffect(() => {
    if (!Array.isArray(allActiveSessions)) return;

    allActiveSessions.forEach((session) => {
      const sId = session.id;
      if (session.status === 'active' && session.remaining_seconds > 0) {
        scheduleNativeTimerAlarm(sId, session.user_name, session.device_name, session.remaining_seconds);
      } else if (session.status === 'paused') {
        cancelNativeTimerAlarm(sId);
      }
    });
  }, [allActiveSessions]);

  const handleSelectChildInChildView = (u) => {
    setSelectedUser(u);
    setCurrentTab('child');
  };

  const handleSelectChildInParentView = (u) => {
    setSelectedUser(u);
  };

  const handleTabSwitch = (tab) => {
    if (tab === 'parent' && !isPinUnlocked) {
      setShowPinModal(true);
    } else {
      setCurrentTab(tab);
      if (tab === 'parent' && window.history.pushState) {
        window.history.pushState(null, '', '/eltern');
      } else if (tab === 'child' && window.history.pushState && !isDirectChildLink) {
        window.history.pushState(null, '', '/');
      }
    }
  };

  const handlePinSuccess = () => {
    setIsPinUnlocked(true);
    setShowPinModal(false);
    setCurrentTab('parent');
    if (window.history.pushState) {
      window.history.pushState(null, '', '/eltern');
    }
  };

  const handleStartSession = async (userId, deviceId, minutes, actorRole) => {
    try {
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          device_id: deviceId,
          requested_minutes: minutes,
          actor_role: actorRole
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Fehler beim Starten der Sitzung');
      } else {
        fetchData();
      }
    } catch (err) {
      alert('Netzwerkfehler beim Starten der Sitzung');
    }
  };

  const handlePauseSession = async (sessionId) => {
    try {
      await fetch('/api/sessions/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      await cancelNativeTimerAlarm(sessionId);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleResumeSession = async (sessionId) => {
    try {
      await fetch('/api/sessions/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelSession = async (sessionId, actorRole) => {
    if (confirm('Möchtest du die Sitzung wirklich beenden?')) {
      try {
        await fetch('/api/sessions/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, actor_role: actorRole })
        });
        await cancelNativeTimerAlarm(sessionId);
        await clearAllDeliveredNotifications();
        fetchData();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleAcknowledgeSession = async (sessionId, actorRole) => {
    try {
      await fetch('/api/sessions/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, actor_role: actorRole })
      });
      await cancelNativeTimerAlarm(sessionId);
      await clearAllDeliveredNotifications();
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditDayTime = async (userId, dateStr, newMinutes, newDeviceName) => {
    try {
      const res = await fetch(`/api/users/${userId}/weekly-summary/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateStr, newMinutes, newDeviceName, weekOffset })
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBankTransaction = async (userId, amountMinutes, note, targetBonusMinutes) => {
    try {
      const res = await fetch('/api/ledger/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          amount_minutes: amountMinutes,
          target_bonus_minutes: targetBonusMinutes,
          note
        })
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateUser = async (name, avatar, budget, id) => {
    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, avatar_id: avatar, weekly_budget_minutes: budget })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateDevice = async (name, type, userId) => {
    try {
      await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, assigned_user_id: userId })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const [displayClients, setDisplayClients] = useState([]);

  const detectDeviceModelName = () => {
    const ua = navigator.userAgent || '';
    if (!ua) return 'Smartphone (Anzeige)';

    const androidMatch = ua.match(/Android\s+[\d\.]+;\s*([^;\)]+)/i);
    if (androidMatch && androidMatch[1]) {
      let model = androidMatch[1].replace(/Build\/.*/i, '').replace(/wv/i, '').trim();
      if (model.startsWith('SM-A')) {
        model = 'Samsung Galaxy A' + model.substring(4);
      } else if (model.startsWith('SM-G') || model.startsWith('SM-S') || model.startsWith('SM-N') || model.startsWith('SM-M') || model.startsWith('SM-F')) {
        model = 'Samsung ' + model;
      }
      if (model.length > 0) {
        return model + ' (Anzeige)';
      }
    }

    if (/iPhone/i.test(ua)) return 'iPhone (Anzeige)';
    if (/iPad/i.test(ua)) return 'iPad (Anzeige)';
    if (/Windows/i.test(ua)) return 'Windows PC (Anzeige)';
    if (/Macintosh/i.test(ua)) return 'Mac (Anzeige)';

    return 'Web Client (Anzeige)';
  };

  // Automatic display smartphone registration / heartbeat
  useEffect(() => {
    let clientUuid = localStorage.getItem('screentime_display_client_uuid');
    if (!clientUuid) {
      clientUuid = 'client_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      localStorage.setItem('screentime_display_client_uuid', clientUuid);
    }

    const registerDisplayClient = async () => {
      try {
        const clientName = detectDeviceModelName();
        const res = await fetch('/api/display-clients/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_uuid: clientUuid,
            client_name: clientName,
            client_info: navigator.userAgent
          })
        });
        const data = await res.json();
        if (data.success && data.client) {
          if (data.client.assigned_user_name) {
            localStorage.setItem('screentime_child_name', data.client.assigned_user_name);
            setIsDirectChildLink(true);
          } else if (data.client.assigned_user_id === null && localStorage.getItem('screentime_child_name')) {
            localStorage.removeItem('screentime_child_name');
            setIsDirectChildLink(false);
          }
        }
      } catch (err) {
        console.error('Display client registration failed:', err);
      }
    };

    registerDisplayClient();
  }, []);

  const handleRenameDisplayClient = async (id, newName) => {
    try {
      await fetch('/api/display-clients/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, client_name: newName })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleDeviceLock = async (deviceId) => {
    try {
      await fetch('/api/devices/toggle-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignDevice = async (deviceId, userId) => {
    try {
      await fetch('/api/devices/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, assigned_user_id: userId })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignDisplayClient = async (clientId, userId) => {
    try {
      await fetch('/api/display-clients/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, assigned_user_id: userId })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteDisplayClient = async (clientId) => {
    try {
      await fetch(`/api/display-clients/${clientId}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      setSelectedUser(null);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteDevice = async (deviceId) => {
    try {
      await fetch(`/api/devices/${deviceId}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="app-container">
      {/* Top Navigation Tabs (hidden in child direct link mode) */}
      {!isDirectChildLink && (
        <div className="nav-bar">
          <button
            className={`nav-tab ${currentTab === 'child' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('child')}
          >
            <span>🎮</span> Kind-Ansicht
          </button>
          <button
            className={`nav-tab ${currentTab === 'parent' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('parent')}
          >
            <span>🛡️</span> Eltern-Bereich
          </button>
        </div>
      )}

      {/* Main View */}
      {currentTab === 'child' ? (
        <ChildDashboard
          users={users}
          selectedUser={selectedUser}
          onSelectUser={handleSelectChildInChildView}
          devices={devices}
          activeSession={activeSession}
          weeklySummary={weeklySummary}
          weekOffset={weekOffset}
          onChangeWeekOffset={(offset) => setWeekOffset(offset)}
          onStartSession={handleStartSession}
          onPauseSession={handlePauseSession}
          onResumeSession={handleResumeSession}
          onCancelSession={handleCancelSession}
          onAcknowledgeSession={handleAcknowledgeSession}
          isDirectChildLink={isDirectChildLink}
          onOpenParentPinModal={() => setShowPinModal(true)}
        />
      ) : (
        <ParentControlCenter
          users={users}
          devices={devices}
          displayClients={displayClients}
          weeklySummary={weeklySummary}
          weekOffset={weekOffset}
          onChangeWeekOffset={(offset) => setWeekOffset(offset)}
          allActiveSessions={allActiveSessions}
          auditLogs={auditLogs}
          selectedUser={selectedUser}
          onSelectUser={handleSelectChildInParentView}
          onEditDayTime={handleEditDayTime}
          onBankTransaction={handleBankTransaction}
          onCreateUser={handleCreateUser}
          onCreateDevice={handleCreateDevice}
          onToggleDeviceLock={handleToggleDeviceLock}
          onAssignDevice={handleAssignDevice}
          onAssignDisplayClient={handleAssignDisplayClient}
          onDeleteDisplayClient={handleDeleteDisplayClient}
          onRenameDisplayClient={handleRenameDisplayClient}
          onDeleteUser={handleDeleteUser}
          onDeleteDevice={handleDeleteDevice}
          onPauseSession={handlePauseSession}
          onResumeSession={handleResumeSession}
          onCancelSession={handleCancelSession}
          onAcknowledgeSession={handleAcknowledgeSession}
        />
      )}

      {/* PIN Authentication Modal */}
      <PinModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSuccess={handlePinSuccess}
      />
    </div>
  );
}
