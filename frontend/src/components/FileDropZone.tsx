import { useRef, useState, DragEvent } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

type Status = 'idle' | 'dragging' | 'uploading' | 'success' | 'error';

interface Props {
  label: string;
  description: string;
  onUpload: (file: File) => Promise<void>;
  disabled?: boolean;
}

export function FileDropZone({ label, description, onUpload, disabled }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setStatus('error');
      setMessage('Only .xlsx / .xls files accepted');
      return;
    }
    setStatus('uploading');
    setMessage('');
    try {
      await onUpload(file);
      setStatus('success');
      setMessage('Imported successfully');
    } catch (e: any) {
      setStatus('error');
      setMessage(e?.response?.data?.message || 'Upload failed');
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handle(file);
    else setStatus('idle');
  };

  const borderColor = {
    idle: 'border-gray-300 hover:border-blue-400',
    dragging: 'border-blue-500 bg-blue-50',
    uploading: 'border-blue-400 bg-blue-50',
    success: 'border-green-400 bg-green-50',
    error: 'border-red-400 bg-red-50',
  }[status];

  return (
    <div
      className={cn('relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all', borderColor, disabled && 'opacity-50 cursor-not-allowed')}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setStatus('dragging'); }}
      onDragLeave={() => setStatus('idle')}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ''; }}
      />

      <div className="flex flex-col items-center gap-2">
        {status === 'uploading' && <Loader2 size={24} className="text-blue-500 animate-spin" />}
        {status === 'success' && <CheckCircle size={24} className="text-green-500" />}
        {status === 'error' && <AlertCircle size={24} className="text-red-500" />}
        {(status === 'idle' || status === 'dragging') && <Upload size={24} className="text-gray-400" />}

        <p className="font-medium text-sm text-gray-700">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>

        {message && (
          <p className={cn('text-xs font-medium mt-1', status === 'success' ? 'text-green-600' : 'text-red-600')}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
