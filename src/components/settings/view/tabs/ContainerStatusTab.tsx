import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Container, Play, Square, RefreshCw, Terminal, Activity, AlertCircle } from 'lucide-react';
import { Button } from '../../../../shared/view/ui';
import SettingsSection from '../SettingsSection';
import SettingsCard from '../SettingsCard';

type ContainerStatus = {
  status: 'none' | 'creating' | 'running' | 'stopped' | 'error';
  containerId?: string;
  port?: number;
  created?: string;
  uptime?: string;
  error?: string;
};

type ContainerInfo = {
  id: number;
  container_id: string;
  container_name: string;
  port: number;
  status: string;
  agent_type: string;
  created_at: string;
  started_at?: string;
  stopped_at?: string;
  last_health_check?: string;
  error_message?: string;
};

export default function ContainerStatusTab() {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<ContainerStatus>({ status: 'none' });
  const [info, setInfo] = useState<ContainerInfo | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [multiUserEnabled, setMultiUserEnabled] = useState(false);

  const fetchStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/containers/status', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.status === 404) {
        // Multi-user mode not enabled
        setMultiUserEnabled(false);
        return;
      }

      setMultiUserEnabled(true);
      const data = await response.json();
      setStatus(data.status);
    } catch (error) {
      console.error('Failed to fetch container status:', error);
      setMultiUserEnabled(false);
    }
  };

  const fetchInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/containers/info', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setInfo(data.container);
      }
    } catch (error) {
      console.error('Failed to fetch container info:', error);
    }
  };

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/containers/logs?tail=100', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Failed to fetch container logs:', error);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchInfo();
    const interval = setInterval(() => {
      fetchStatus();
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/containers/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        await fetchStatus();
        await fetchInfo();
      }
    } catch (error) {
      console.error('Failed to start container:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/containers/stop', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        await fetchStatus();
        await fetchInfo();
      }
    } catch (error) {
      console.error('Failed to stop container:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/containers/restart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        await fetchStatus();
        await fetchInfo();
      }
    } catch (error) {
      console.error('Failed to restart container:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewLogs = async () => {
    if (!showLogs) {
      await fetchLogs();
    }
    setShowLogs(!showLogs);
  };

  if (!multiUserEnabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Container className="mb-4 h-16 w-16 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-semibold">Multi-User Mode Disabled</h3>
        <p className="max-w-md text-sm text-muted-foreground">
          Container management is only available when multi-user mode is enabled.
          Set <code className="rounded bg-muted px-1 py-0.5">MULTI_USER_MODE=true</code> in your environment configuration.
        </p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-600 dark:text-green-400';
      case 'stopped': return 'text-gray-600 dark:text-gray-400';
      case 'creating': return 'text-blue-600 dark:text-blue-400';
      case 'error': return 'text-red-600 dark:text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Activity className="h-4 w-4" />;
      case 'stopped': return <Square className="h-4 w-4" />;
      case 'creating': return <RefreshCw className="h-4 w-4 animate-spin" />;
      case 'error': return <AlertCircle className="h-4 w-4" />;
      default: return <Container className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Container Status"
        description="Manage your isolated development environment"
      >
        <SettingsCard>
          <div className="space-y-4">
            {/* Status Display */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-muted ${getStatusColor(status.status)}`}>
                  {getStatusIcon(status.status)}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    Status: <span className={getStatusColor(status.status)}>{status.status}</span>
                  </p>
                  {info && (
                    <p className="text-xs text-muted-foreground">
                      {info.container_name} • Port {info.port}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {status.status === 'running' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRestart}
                      disabled={loading}
                    >
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                      Restart
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStop}
                      disabled={loading}
                    >
                      <Square className="h-4 w-4" />
                      Stop
                    </Button>
                  </>
                )}
                {(status.status === 'stopped' || status.status === 'none') && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleStart}
                    disabled={loading}
                  >
                    <Play className="h-4 w-4" />
                    Start
                  </Button>
                )}
              </div>
            </div>

            {/* Container Info */}
            {info && (
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Agent Type</p>
                    <p className="font-medium">{info.agent_type}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Container ID</p>
                    <p className="font-mono text-xs">{info.container_id.substring(0, 12)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="text-xs">{new Date(info.created_at).toLocaleString()}</p>
                  </div>
                  {info.started_at && (
                    <div>
                      <p className="text-muted-foreground">Started</p>
                      <p className="text-xs">{new Date(info.started_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>

                {info.error_message && (
                  <div className="mt-4 rounded-md bg-red-500/10 p-3">
                    <p className="text-xs text-red-600 dark:text-red-400">
                      <AlertCircle className="mr-1 inline h-3 w-3" />
                      {info.error_message}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Logs Section */}
            <div className="border-t border-border pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleViewLogs}
                className="w-full"
              >
                <Terminal className="h-4 w-4" />
                {showLogs ? 'Hide Logs' : 'View Logs'}
              </Button>

              {showLogs && (
                <div className="mt-4 max-h-64 overflow-y-auto rounded-md border border-border bg-black p-4">
                  <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
                    {logs || 'No logs available'}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* Information Section */}
      <SettingsSection
        title="About Containers"
        description="Your isolated development environment"
      >
        <SettingsCard>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Each user gets their own isolated Docker container with a complete CloudCLI environment.
              Your container includes:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Dedicated computing resources</li>
              <li>Isolated file system and network</li>
              <li>Persistent storage for your projects</li>
              <li>Secure credential management</li>
            </ul>
            <p className="pt-2">
              Containers are automatically started when you log in and can be manually controlled here.
            </p>
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
