import { useState, useEffect, useRef } from 'react';
import { Search, Upload, Grid, List, Folder, FileText, Image, Film, Code, Archive, BarChart3, Presentation, Download, Trash2, Eye } from 'lucide-react';
import { Button, EmptyState, LoadingState } from '@/components/ui';
import { cn, formatFileSize, formatDate } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { getFiles, getFolders, getUsers, getUserById, uploadFile, deleteFile } from '@/services/api';
import { toast } from 'sonner';
import type { FileItem, Folder as FolderType } from '@/types';

const fileIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  document: FileText, image: Image, video: Film, code: Code, archive: Archive,
  spreadsheet: BarChart3, presentation: Presentation, other: FileText,
};

export function FilesPage() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleView = async (file: FileItem) => {
    const filePath = `${file.folder}/${file.name}`;
    try {
      const { data, error } = await supabase.storage
        .from('files')
        .createSignedUrl(filePath, 60);

      if (error) throw error;
      
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      console.error(err);
      toast.error('Failed to open file');
    }
  };

  const handleDownload = async (file: FileItem) => {
    const filePath = `${file.folder}/${file.name}`;
    const toastId = toast.loading('Downloading...');
    try {
      const { data, error } = await supabase.storage
        .from('files')
        .download(filePath);

      if (error) throw error;

      const blob = new Blob([data]);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = file.name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      
      toast.success('Download complete', { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to download file', { id: toastId });
    }
  };

  const handleDelete = async (file: FileItem) => {
    const filePath = `${file.folder}/${file.name}`;
    const toastId = toast.loading('Deleting file...');
    try {
      // 1. Delete from Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('files')
        .remove([filePath]);
        
      if (storageError) throw storageError;

      // 2. Delete metadata row from DB
      const { error: dbError } = await supabase
        .from('files')
        .delete()
        .eq('id', file.id);
        
      if (dbError) throw dbError;

      // 3. Update local state
      setFiles(prev => prev.filter(f => f.id !== file.id));
      
      toast.success('File deleted successfully', { id: toastId });
    } catch (err: any) {
      console.error('Delete error:', err);
      toast.error(err.message || 'Failed to delete file', { id: toastId });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const toastId = toast.loading(`Uploading "${file.name}"...`);
    try {
      const uploaded = await uploadFile(file, selectedFolder || 'General');
      setFiles(prev => [uploaded, ...prev]);
      toast.success('File uploaded successfully!', { id: toastId });
    } catch (err: any) {
      console.error('File upload error:', err);
      toast.error(err?.message || 'Failed to upload file.', { id: toastId, duration: 8000 });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        await getUsers();
        const [fls, flds] = await Promise.all([getFiles(), getFolders()]);
        if (isMounted) {
          setFiles(fls);
          setFolders(flds);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, []);

  const currentFiles = selectedFolder
    ? files.filter(f => f.folder === selectedFolder)
    : files;

  const filtered = currentFiles.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  if (isLoading) return <LoadingState />;

  return (
    <div className="page-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Files</h1>
          <p className="page-description">{selectedFolder || 'All files'} • {filtered.length} files</p>
        </div>
        <Button onClick={handleUploadClick} disabled={isUploading}>
          <Upload className="w-4 h-4 mr-1" /> {isUploading ? 'Uploading...' : 'Upload'}
        </Button>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted-foreground)]" />
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-[var(--color-input)] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          />
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-muted)]">
          <button onClick={() => setView('grid')} className={cn('p-1.5 rounded-md transition-colors', view === 'grid' ? 'bg-[var(--color-card)] shadow-sm' : '')}><Grid className="w-4 h-4" /></button>
          <button onClick={() => setView('list')} className={cn('p-1.5 rounded-md transition-colors', view === 'list' ? 'bg-[var(--color-card)] shadow-sm' : '')}><List className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Folders */}
      {!selectedFolder && folders.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold mb-3">Folders</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {folders.map(folder => (
              <button
                key={folder.id}
                onClick={() => setSelectedFolder(folder.name)}
                className="card p-4 card-hover text-center"
              >
                <Folder className="w-8 h-8 mx-auto mb-2 text-[var(--color-primary)]" />
                <p className="text-sm font-medium truncate">{folder.name}</p>
                <p className="text-xs text-[var(--color-muted-foreground)]">{folder.fileCount} files</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedFolder && (
        <button onClick={() => setSelectedFolder(null)} className="text-sm text-[var(--color-primary)] hover:underline mb-4 inline-block">
          ← All Folders
        </button>
      )}

      {/* Files */}
      <h2 className="text-sm font-semibold mb-3">{selectedFolder ? `${selectedFolder} Files` : 'Recent Files'}</h2>
      {filtered.length === 0 ? (
        <EmptyState title="No files found" description="Try a different search or upload new files." />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((file, idx) => {
            const Icon = fileIcons[file.type] || FileText;
            const uploader = getUserById(file.uploadedBy);
            return (
              <div key={file.id} className={cn('card p-4 card-hover animate-slide-up', `stagger-${Math.min(idx + 1, 5)}`)}>
                <div className="flex items-center justify-center h-20 mb-3 rounded-lg bg-[var(--color-muted)]">
                  <Icon className="w-8 h-8 text-[var(--color-muted-foreground)]" />
                </div>
                <p className="text-sm font-medium truncate">{file.name}</p>
                <div className="flex items-center justify-between mt-2 text-xs text-[var(--color-muted-foreground)]">
                  <span>{formatFileSize(file.size)}</span>
                  <span>{formatDate(file.uploadedAt)}</span>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--color-border)]">
                  <span className="text-xs text-[var(--color-muted-foreground)]">{uploader?.name || 'User'}</span>
                  <div className="flex gap-1">
                    <button className="p-1 rounded hover:bg-[var(--color-muted)] transition-colors" onClick={() => handleView(file)} title="View"><Eye className="w-3.5 h-3.5 text-[var(--color-muted-foreground)]" /></button>
                    <button className="p-1 rounded hover:bg-[var(--color-muted)] transition-colors" onClick={() => handleDownload(file)} title="Download"><Download className="w-3.5 h-3.5 text-[var(--color-muted-foreground)]" /></button>
                    <button className="p-1 rounded hover:bg-[var(--color-muted)] transition-colors" onClick={() => handleDelete(file)} title="Delete"><Trash2 className="w-3.5 h-3.5 text-[var(--color-muted-foreground)]" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--color-muted-foreground)] border-b border-[var(--color-border)]">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Size</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Uploaded By</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Date</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filtered.map(file => {
                const Icon = fileIcons[file.type] || FileText;
                const uploader = getUserById(file.uploadedBy);
                return (
                  <tr key={file.id} className="hover:bg-[var(--color-muted)] transition-colors">
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><Icon className="w-4 h-4 text-[var(--color-muted-foreground)]" /><span className="font-medium truncate max-w-[200px]">{file.name}</span></div></td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)] hidden sm:table-cell">{formatFileSize(file.size)}</td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)] hidden md:table-cell">{uploader?.name || 'User'}</td>
                    <td className="px-4 py-3 text-[var(--color-muted-foreground)] hidden sm:table-cell">{formatDate(file.uploadedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1.5 rounded hover:bg-[var(--color-muted)] transition-colors" onClick={() => handleView(file)} title="View"><Eye className="w-4 h-4 text-[var(--color-muted-foreground)]" /></button>
                        <button className="p-1.5 rounded hover:bg-[var(--color-muted)] transition-colors" onClick={() => handleDownload(file)} title="Download"><Download className="w-4 h-4 text-[var(--color-muted-foreground)]" /></button>
                        <button className="p-1.5 rounded hover:bg-[var(--color-muted)] transition-colors" onClick={() => handleDelete(file)} title="Delete"><Trash2 className="w-4 h-4 text-[var(--color-muted-foreground)]" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
