import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Edit, Archive, RotateCcw, ArchiveRestore, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useSemester } from '@/contexts/SemesterContext';
import { semesterStorage, type Semester } from '@/utils/semesterStorage';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function SemesterConfigPage() {
  const { toast } = useToast();
  const { refreshSemesters } = useSemester();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showArchivedStorageDialog, setShowArchivedStorageDialog] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    startDate: '',
    endDate: '',
    isActive: true,
    isCurrent: false,
  });

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    loadSemesters();
  }, []);

  const loadSemesters = async () => {
    try {
      const res = await fetch(`${API_BASE}/semesters`);
      const data = await res.json();
      if (data?.success && Array.isArray(data.semesters)) {
        setSemesters(data.semesters.map((s: any) => ({
          id: s._id,
          name: s.name,
          code: s.code,
          startDate: s.startDate,
          endDate: s.endDate,
          isActive: s.isActive,
          isCurrent: s.isCurrent,
          isArchived: s.isArchived || false,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })));
      }
    } catch (err) {
      console.error("Failed to load semesters:", err);
      toast({
        title: 'Error',
        description: 'Failed to connect to server',
        variant: 'destructive',
      });
    }
  };

  const activeSemesters = semesters.filter((s) => !s.isArchived);
  const archivedSemesters = semesters.filter((s) => !!s.isArchived);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.code || !formData.startDate || !formData.endDate) {
      toast({
        title: 'Error',
        description: 'Please fill all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (new Date(formData.endDate) <= new Date(formData.startDate)) {
      toast({
        title: 'Error',
        description: 'End date must be after start date',
        variant: 'destructive',
      });
      return;
    }

    try {
      const method = selectedId ? 'PUT' : 'POST';
      const url = selectedId ? `${API_BASE}/semesters/${selectedId}` : `${API_BASE}/semesters`;
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const result = await res.json();
      if (result.success) {
        toast({
          title: 'Success',
          description: selectedId ? 'Semester updated successfully' : 'Semester added successfully',
        });
        setShowDialog(false);
        resetForm();
        loadSemesters();
        refreshSemesters();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Operation failed',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to contact server',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (semester: Semester) => {
    setSelectedId(semester.id);
    setFormData({
      name: semester.name,
      code: semester.code,
      startDate: String(semester.startDate).split('T')[0],
      endDate: String(semester.endDate).split('T')[0],
      isActive: semester.isActive,
      isCurrent: semester.isCurrent,
    });
    setShowDialog(true);
  };

  const handleOpenArchiveConfirm = (id: string) => {
    setSelectedId(id);
    setShowArchiveDialog(true);
  };

  const confirmArchive = async () => {
    if (!selectedId) return;
    
    try {
      const res = await fetch(`${API_BASE}/semesters/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: true, isCurrent: false }),
      });
      const result = await res.json();
      
      if (result.success) {
        toast({
          title: 'Semester Archived',
          description: 'Semester moved to Archived Storage. You can restore it anytime.',
        });
        loadSemesters();
        refreshSemesters();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to archive semester',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to contact server',
        variant: 'destructive',
      });
    }
    
    setShowArchiveDialog(false);
    setSelectedId(null);
  };

  const handleRestore = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/semesters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: false }),
      });
      const result = await res.json();
      
      if (result.success) {
        toast({
          title: 'Semester Restored',
          description: 'Semester restored to active list successfully.',
        });
        loadSemesters();
        refreshSemesters();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to restore semester',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to contact server',
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (id: string, field: 'isActive' | 'isCurrent') => {
    const semester = semesters.find(s => s.id === id);
    if (!semester) return;
    
    const updates = { [field]: !semester[field] };
    
    try {
      const res = await fetch(`${API_BASE}/semesters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const result = await res.json();
      
      if (result.success) {
        loadSemesters();
        refreshSemesters();
        toast({
          title: 'Updated',
          description: `Semester ${field === 'isActive' ? 'status' : 'current flag'} updated`,
        });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update semester',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      startDate: '',
      endDate: '',
      isActive: true,
      isCurrent: false,
    });
    setSelectedId(null);
  };

  const currentSemester = activeSemesters.find(s => s.isCurrent);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            Academic Term Configuration
          </h1>
          <p className="text-muted-foreground text-sm">
            Manage active academic terms and restore archived semesters without losing data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowArchivedStorageDialog(true)}
            className="gap-2 border-border/80 h-9 text-xs"
          >
            <Archive className="h-4 w-4 text-muted-foreground" />
            Archived Semesters
            {archivedSemesters.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] font-semibold">
                {archivedSemesters.length}
              </Badge>
            )}
          </Button>
          <Button onClick={() => setShowDialog(true)} className="gap-2 h-9 text-xs">
            <Plus className="h-4 w-4" />
            Add Semester
          </Button>
        </div>
      </div>

      {/* Current Semester Card */}
      <Card className="shadow-soft border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-primary" />
            Current Active Term
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentSemester ? (
            <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-base text-foreground">
                    {currentSemester.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="font-mono font-medium text-foreground bg-primary/10 text-primary px-2 py-0.5 rounded">
                      {currentSemester.code}
                    </span>
                    <span>•</span>
                    <span>
                      {new Date(currentSemester.startDate).toLocaleDateString()} —{' '}
                      {new Date(currentSemester.endDate).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <Badge variant="default" className="self-start sm:self-center text-xs">
                  Active & Current
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No semester marked as current.</p>
          )}
        </CardContent>
      </Card>

      {/* Active Semesters List */}
      <Card className="shadow-soft border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Active Semesters</CardTitle>
          <CardDescription className="text-xs">
            {activeSemesters.length} active term{activeSemesters.length !== 1 ? 's' : ''} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {activeSemesters.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-xl">
                <Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">No active semesters found</p>
                <p className="text-xs text-muted-foreground mt-1">Click "Add Semester" or restore from the archive storage.</p>
              </div>
            ) : (
              activeSemesters.map((semester) => (
                <div 
                  key={semester.id} 
                  className={`p-4 border rounded-xl transition-all hover:bg-muted/40 ${
                    semester.isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border/70'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <h3 className="font-semibold text-foreground text-sm truncate">{semester.name}</h3>
                        <Badge variant="outline" className="text-xs shrink-0 font-mono">
                          {semester.code}
                        </Badge>
                        {semester.isCurrent && (
                          <Badge className="bg-primary text-primary-foreground text-[10px] shrink-0">
                            Current
                          </Badge>
                        )}
                        {!semester.isActive && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-0.5 text-xs text-muted-foreground">
                        <p>
                          {new Date(semester.startDate).toLocaleDateString()} —{' '}
                          {new Date(semester.endDate).toLocaleDateString()}
                        </p>
                        <p className="text-[11px] text-muted-foreground/70">
                          Created: {new Date(semester.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div className="flex flex-col gap-2 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`active-${semester.id}`}
                            checked={semester.isActive}
                            onCheckedChange={() => handleToggleStatus(semester.id, 'isActive')}
                          />
                          <Label htmlFor={`active-${semester.id}`} className="text-sm cursor-pointer">
                            Active
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`current-${semester.id}`}
                            checked={semester.isCurrent}
                            onCheckedChange={() => handleToggleStatus(semester.id, 'isCurrent')}
                            disabled={!semester.isActive}
                          />
                          <Label htmlFor={`current-${semester.id}`} className="text-sm cursor-pointer">
                            Current
                          </Label>
                        </div>
                      </div>
                      
                      <div className="flex gap-1 self-end sm:self-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(semester)}
                          className="h-8 w-8 p-0 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
                          title="Edit semester"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenArchiveConfirm(semester.id)}
                          className="h-8 w-8 p-0 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20 transition-colors"
                          title="Archive semester"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>
              {selectedId ? 'Edit Semester' : 'Add New Semester'}
            </DialogTitle>
            <DialogDescription>
              Configure semester details for academic tracking
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Semester Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="1st Semester 2026-2027"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">
                    Semester Code <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="code"
                    placeholder="2026-2027-1ST"
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value})}
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">
                    Start Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">
                    End Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-start gap-3">
                  <Switch
                    id="isCurrent"
                    checked={formData.isCurrent}
                    onCheckedChange={(checked) => 
                      setFormData({...formData, isCurrent: checked})
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Label htmlFor="isCurrent" className="font-medium cursor-pointer text-sm">
                        Mark as Current Semester
                      </Label>
                      {formData.isCurrent && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs whitespace-nowrap">
                          Only one current allowed
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This will be the default for new syllabus uploads
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => 
                      setFormData({...formData, isActive: checked})
                    }
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive" className="font-medium cursor-pointer text-sm">
                      Active
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Available for selection
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter className="mt-6">
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setShowDialog(false)}
                  className="w-full order-2 sm:order-1 h-9 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="w-full order-1 sm:order-2 h-9 text-xs"
                >
                  {selectedId ? 'Update' : 'Create'} Semester
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Archive Alert Dialog */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Archive Semester
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Are you sure you want to archive this semester? It will be safely stored in the Archived Semesters storage.
              <br /><br />
              <strong className="text-foreground">No syllabus or report data will be lost</strong>, and you can restore it anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmArchive}
              className="bg-amber-600 text-white hover:bg-amber-700 h-9 text-xs"
            >
              Archive Semester
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archived Semesters Storage Dialog */}
      <Dialog open={showArchivedStorageDialog} onOpenChange={setShowArchivedStorageDialog}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] flex flex-col">
          <DialogHeader className="pb-3 border-b border-border/70">
            <div className="flex items-center gap-2">
              <ArchiveRestore className="h-5 w-5 text-primary" />
              <DialogTitle className="text-lg">Archived Semesters Storage</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              View and restore previously archived terms. Restoring a semester immediately brings it back to the active list without losing data.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 flex-1 overflow-y-auto space-y-3 pr-1">
            {archivedSemesters.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-xl">
                <Archive className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">No archived semesters</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Archived academic terms will be stored here for safe keeping and easy restoration.
                </p>
              </div>
            ) : (
              archivedSemesters.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 border border-border/70 rounded-xl bg-card hover:bg-muted/30 transition-colors gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-semibold text-sm text-foreground truncate">{s.name}</p>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {s.code}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
                        Archived
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.startDate).toLocaleDateString()} — {new Date(s.endDate).toLocaleDateString()}
                    </p>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(s.id)}
                    className="h-8 px-3 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10 self-end sm:self-center shrink-0"
                    title="Restore semester to active list"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-border/70">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowArchivedStorageDialog(false)}
              className="h-8 text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
