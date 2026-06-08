import { useState } from 'react';
import { Layout, PageHeader } from '../components/Layout';
import { FileDropZone } from '../components/FileDropZone';
import { Button } from '../components/ui/button';
import { Card, CardBody } from '../components/ui/card';
import { importFile, runReconciliation, resetDatabase, importSalesRegister } from '../api';
import { useAuth } from '../auth/AuthContext';
import { RefreshCw, CheckCircle, Trash2 } from 'lucide-react';

interface SalesUploadResult {
  file: string;
  source_company: string;
  records: number;
  skipped: number;
  errors: string[];
}

function SalesMultiUpload({ disabled }: { disabled: boolean }) {
  const [results, setResults] = useState<SalesUploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useState<HTMLInputElement | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || disabled) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const res = await importSalesRegister(file);
        setResults(prev => [...prev, {
          file: file.name,
          source_company: res.data.source_company ?? 'unknown',
          records: res.data.records ?? 0,
          skipped: res.data.skipped ?? 0,
          errors: res.data.errors ?? [],
        }]);
      } catch {
        setResults(prev => [...prev, { file: file.name, source_company: '?', records: 0, skipped: 0, errors: ['Upload failed'] }]);
      }
    }
    setUploading(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      <label
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors
          ${disabled ? 'opacity-40 pointer-events-none border-gray-200 bg-gray-50' : 'border-blue-300 bg-blue-50/40 hover:bg-blue-50'}`}
      >
        <input
          type="file"
          accept=".xlsx,.xls"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={e => handleFiles(e.target.files)}
        />
        <p className="text-sm font-medium text-blue-600">{uploading ? 'Uploading…' : 'Drop files here or click to browse'}</p>
        <p className="text-xs text-gray-400 mt-1">Accepts multiple files — company auto-detected from each file header</p>
      </label>

      {results.length > 0 && (
        <div className="space-y-1">
          {results.map((r, i) => (
            <div key={i} className={`flex items-center gap-3 text-xs px-3 py-2 rounded-lg border ${r.errors.length ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
              <span className="font-mono text-gray-500 truncate max-w-[200px]">{r.file}</span>
              <span className="font-semibold uppercase text-gray-700">{r.source_company.replace(/_/g, ' ')}</span>
              {r.errors.length === 0 ? (
                <span className="text-green-700">{r.records} imported · {r.skipped} skipped</span>
              ) : (
                <span className="text-red-600">{r.errors[0]}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Import() {
  const { canEdit, isAdmin } = useAuth();
  const [running, setRunning] = useState(false);
  const [reconResult, setReconResult] = useState<any>(null);
  const [reconError, setReconError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const upload = (route: string) => async (file: File) => {
    await importFile(route, file);
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetDatabase();
      setConfirmReset(false);
      setReconResult(null);
      setReconError('');
    } finally {
      setResetting(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setReconResult(null);
    setReconError('');
    try {
      const res = await runReconciliation();
      setReconResult(res.data);
    } catch (e: any) {
      setReconError(e?.response?.data?.message || 'Reconciliation failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Import Files"
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FileDropZone
            label="Group A Balances"
            description="55 sheets · SUMMARY + account ledgers"
            onUpload={upload('group-a')}
            disabled={!canEdit}
          />
          <FileDropZone
            label="Group B Balances"
            description="259 sheets · 3 SUMMARY sheets merged"
            onUpload={upload('group-b')}
            disabled={!canEdit}
          />
          {false && <FileDropZone
            label="Daily Transactions"
            description="Date-block format · TRANSACTION ON rows"
            onUpload={upload('transactions')}
            disabled={!canEdit}
          />}
          {false && <FileDropZone
            label="Daily Cashflow"
            description="Filename = date · Sheet1 cashflow · Sheet2 counterparty"
            onUpload={upload('cashflow')}
            disabled={!canEdit}
          />}
        </div>

        <div className="border-t pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Sales Registers</p>
          <p className="text-xs text-gray-400 mb-3">
            Drop any sales register XLS — company name is auto-detected from the file header. Works for any company.
          </p>
          <SalesMultiUpload disabled={!canEdit} />
        </div>

        {canEdit && (
          <Card>
            <CardBody className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">Manual Reconciliation</p>
                <p className="text-xs text-gray-500 mt-0.5">Trigger all 10 checks against current data</p>
              </div>
              <Button onClick={handleRun} loading={running} variant="primary">
                <RefreshCw size={14} />
                Run Reconciliation
              </Button>
            </CardBody>
          </Card>
        )}

        {false && isAdmin && (
          <Card className="border-red-200">
            <CardBody className="flex items-center justify-between">
              <div>
                <p className="font-medium text-red-700 text-sm">Reset Database</p>
                <p className="text-xs text-gray-500 mt-0.5">Wipe all imported data and flags — keeps tables and users</p>
              </div>
              {confirmReset ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-medium">Are you sure?</span>
                  <Button onClick={handleReset} loading={resetting} variant="danger" size="sm">
                    Yes, wipe it
                  </Button>
                  <Button onClick={() => setConfirmReset(false)} variant="ghost" size="sm">
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setConfirmReset(true)} variant="danger" size="sm">
                  <Trash2 size={14} />
                  Reset
                </Button>
              )}
            </CardBody>
          </Card>
        )}

        {reconResult && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <CheckCircle size={18} className="text-green-600 mt-0.5 shrink-0" />
            <div className="text-sm text-green-800">
              <p className="font-medium">Reconciliation complete</p>
              <p className="text-xs mt-0.5 text-green-600">
                {reconResult.flagsCreated ?? reconResult.length ?? 'Check the Flags page for results'}
              </p>
            </div>
          </div>
        )}

        {reconError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
            {reconError}
          </div>
        )}
      </div>
    </Layout>
  );
}
