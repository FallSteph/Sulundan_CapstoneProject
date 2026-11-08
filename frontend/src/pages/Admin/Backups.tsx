import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Download, 
  Trash2, 
  RefreshCw, 
  ShieldCheck, 
  FileArchive,
  AlertTriangle,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import AccessDenied from '@/components/Layout/AccessDenied';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

interface BackupFile {
  filename: string;
  size: string;
  createdAt: string;
}

export default function BackupsPage() {
  const { user } = useAuth();
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupToDelete, setBackupToDelete] = useState<string | null>(null);

  // --- CLIENT-SIDE ACCESS CHECK ---
  if (!user || user.role !== 'admin') {
    return <AccessDenied />;
  }

  const fetchBackups = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/admin/backups`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setBackups(data.backups);
      } else {
        toast.error(data.error || 'Failed to load backups');
      }
    } catch (err) {
      toast.error('Connection error while fetching backups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async () => {
    try {
      setIsBackingUp(true);
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/admin/backup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Backup created successfully');
        fetchBackups();
      } else {
        toast.error(data.error || 'Failed to create backup');
      }
    } catch (err) {
      toast.error('Connection error while creating backup');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDownload = async (filename: string) => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/admin/backups/${filename}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!res.ok) throw new Error('Download failed');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      toast.error('Failed to download backup');
    }
  };

  const confirmDelete = (filename: string) => {
    setBackupToDelete(filename);
  };

  const handleDelete = async () => {
    if (!backupToDelete) return;
    const filename = backupToDelete;
    
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/admin/backups/${filename}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Backup deleted');
        fetchBackups();
      } else {
        toast.error(data.error || 'Failed to delete backup');
      }
    } catch (err) {
      toast.error('Connection error while deleting backup');
    } finally {
      setBackupToDelete(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Backup & Security</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage system backups and security configurations
          </p>
        </div>
        <Button 
          onClick={handleCreateBackup} 
          disabled={isBackingUp}
          className="bg-primary hover:bg-primary/90 shadow-soft h-9 text-xs gap-2"
        >
          {isBackingUp ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Database className="mr-1 h-3.5 w-3.5" />}
          Run Manual Backup
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Security Status Card */}
        <Card className="lg:col-span-1 shadow-soft border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-success" />
              Security Status
            </CardTitle>
            <CardDescription>Current protection active</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-success/5 border border-success/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm font-medium">Helmet Protection</span>
              </div>
              <Badge variant="success">Active</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-success/5 border border-success/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm font-medium">Rate Limiting</span>
              </div>
              <Badge variant="success">Active</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-success/5 border border-success/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm font-medium">NoSQL Sanitization</span>
              </div>
              <Badge variant="success">Active</Badge>
            </div>
            <div className="p-4 rounded-lg bg-info/5 border border-info/10 mt-6">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-info" />
                <span className="text-sm font-bold text-info">Auto-Backup Schedule</span>
              </div>
              <p className="text-xs text-muted-foreground">
                A full system backup is automatically created every day at 2:00 AM. Backups are kept for 7 days.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Backups List */}
        <Card className="lg:col-span-2 shadow-soft border-primary/10">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileArchive className="h-5 w-5 text-primary" />
                System Backups
              </CardTitle>
              <CardDescription>Download or manage previous backups</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={fetchBackups} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : backups.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-xl">
                <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
                <h3 className="font-medium text-lg">No backups found</h3>
                <p className="text-muted-foreground max-w-xs mx-auto">
                  Click the button above to create your first system backup.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {backups.map((backup) => (
                  <div 
                    key={backup.filename}
                    className="flex items-center justify-between p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileArchive className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm group-hover:text-primary transition-colors">{backup.filename}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Database className="h-3 w-3" /> {backup.size}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {new Date(backup.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleDownload(backup.filename)}
                        className="rounded-lg h-9"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => confirmDelete(backup.filename)}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive h-9 w-9 rounded-lg"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!backupToDelete} onOpenChange={(open) => !open && setBackupToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete backup {backupToDelete}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Badge helper since I'm not sure if it's imported correctly in all projects
function Badge({ children, variant }: { children: React.ReactNode, variant: 'success' | 'warning' | 'info' }) {
  const styles = {
    success: 'bg-success/10 text-success border-success/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    info: 'bg-info/10 text-info border-info/20'
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles[variant]}`}>
      {children}
    </span>
  );
}
