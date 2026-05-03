import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Key, Plus, Trash2, Eye, EyeOff, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '../../../../shared/view/ui';
import SettingsSection from '../SettingsSection';
import SettingsCard from '../SettingsCard';
import { authenticatedFetch } from '../../../../utils/api';

type Credential = {
  id: number;
  name: string;
  type: string;
  description?: string;
  created_at: string;
  updated_at?: string;
};

type CredentialType = 'api_key' | 'password' | 'env_var' | 'ssh_key' | 'certificate' | 'token';

const CREDENTIAL_TYPES: { value: CredentialType; label: string; description: string }[] = [
  { value: 'api_key', label: 'API Key', description: 'Third-party API tokens' },
  { value: 'password', label: 'Password', description: 'Service passwords' },
  { value: 'env_var', label: 'Environment Variable', description: 'Generic environment variables' },
  { value: 'ssh_key', label: 'SSH Key', description: 'SSH private keys' },
  { value: 'certificate', label: 'Certificate', description: 'SSL/TLS certificates' },
  { value: 'token', label: 'Token', description: 'OAuth or JWT tokens' },
];

export default function CredentialsManagementTab() {
  const { t } = useTranslation('settings');
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [multiUserEnabled, setMultiUserEnabled] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'api_key' as CredentialType,
    value: '',
    description: ''
  });
  const [showValue, setShowValue] = useState(false);

  const fetchCredentials = async () => {
    try {
      const response = await authenticatedFetch('/api/credentials');

      if (response.status === 404) {
        setMultiUserEnabled(false);
        return;
      }

      setMultiUserEnabled(true);

      if (response.ok) {
        const data = await response.json();
        setCredentials(data.credentials);
      }
    } catch (error) {
      console.error('Failed to fetch credentials:', error);
      setMultiUserEnabled(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await authenticatedFetch('/api/credentials', {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: data.message || 'Credential saved successfully' });
        setShowAddModal(false);
        setFormData({ name: '', type: 'api_key', value: '', description: '' });
        await fetchCredentials();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save credential' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save credential' });
      console.error('Failed to add credential:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this credential? Your container will restart.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await authenticatedFetch(`/api/credentials/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Credential deleted successfully' });
        await fetchCredentials();
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'Failed to delete credential' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete credential' });
      console.error('Failed to delete credential:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (!multiUserEnabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Key className="mb-4 h-16 w-16 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-semibold">Multi-User Mode Disabled</h3>
        <p className="max-w-md text-sm text-muted-foreground">
          Credential management is only available when multi-user mode is enabled.
          Set <code className="rounded bg-muted px-1 py-0.5">MULTI_USER_MODE=true</code> in your environment configuration.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Message Banner */}
      {message && (
        <div className={`rounded-lg border p-4 ${
          message.type === 'success'
            ? 'border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400'
            : 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <p className="text-sm">{message.text}</p>
          </div>
        </div>
      )}

      <SettingsSection
        title="Credentials & Secrets"
        description="Securely store API keys, passwords, and tokens for your container"
      >
        <SettingsCard>
          <div className="space-y-4">
            {/* Add Credential Button */}
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                {credentials.length} credential{credentials.length !== 1 ? 's' : ''} stored
              </p>
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowAddModal(true)}
              >
                <Plus className="h-4 w-4" />
                Add Credential
              </Button>
            </div>

            {/* Credentials List */}
            {credentials.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/50 p-8 text-center">
                <Lock className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                <p className="text-sm font-medium">No credentials stored</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add API keys, passwords, or tokens to use in your container
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {credentials.map((cred) => (
                  <div
                    key={cred.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <Key className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium font-mono truncate">{cred.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {cred.type}
                          {cred.description && ` • ${cred.description}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(cred.id)}
                      disabled={loading}
                      className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* Security Information */}
      <SettingsSection
        title="Security"
        description="How your credentials are protected"
      >
        <SettingsCard>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 flex-shrink-0 mt-0.5 text-primary" />
              <div>
                <p className="font-medium text-foreground">AES-256-GCM Encryption</p>
                <p className="text-xs">All credentials are encrypted at rest in the database</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Key className="h-5 w-5 flex-shrink-0 mt-0.5 text-primary" />
              <div>
                <p className="font-medium text-foreground">User-Specific Keys</p>
                <p className="text-xs">Each user's credentials use unique encryption keys</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-primary" />
              <div>
                <p className="font-medium text-foreground">Zero Knowledge</p>
                <p className="text-xs">Values are never returned after storage</p>
              </div>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* Add Credential Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold">Add Credential</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                  placeholder="GITHUB_TOKEN"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                  pattern="[A-Z_][A-Z0-9_]*"
                  title="Must start with letter or underscore, contain only uppercase letters, numbers, and underscores"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Used as environment variable name (uppercase, A-Z, 0-9, _)
                </p>
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as CredentialType })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {CREDENTIAL_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label} - {type.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Value */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Value <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <textarea
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder={formData.type === 'ssh_key' ? 'Paste your SSH private key...' : 'Paste your credential value...'}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                    rows={formData.type === 'ssh_key' || formData.type === 'certificate' ? 6 : 3}
                    required
                    style={{ fontFamily: 'monospace' }}
                    type={showValue ? 'text' : 'password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowValue(!showValue)}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1.5">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddModal(false);
                    setFormData({ name: '', type: 'api_key', value: '', description: '' });
                  }}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : 'Save Credential'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
