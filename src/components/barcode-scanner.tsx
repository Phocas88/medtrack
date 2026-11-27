'use client';

import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Camera, Keyboard } from 'lucide-react';

interface Props {
  onScan: (value: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<'camera' | 'manual'>('manual');
  const [manualValue, setManualValue] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);

  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    if (mode !== 'camera') return;
    let closed = false;
    let stream: MediaStream | undefined;
    let controls: IScannerControls | undefined;

    function stopCamera() {
      closed = true;
      controls?.stop();
      stream?.getTracks().forEach(track => track.stop());
    }

    async function startCamera() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (closed) return;
        const video = videoRef.current;
        if (!video) return;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (closed) { stopCamera(); return; }
        controls = await new BrowserMultiFormatReader().decodeFromStream(stream, video, (result, _error, session) => {
          if (closed || !result) return;
          controls = session;
          stopCamera();
          setScanning(false);
          setMode('manual');
          onScanRef.current(result.getText());
        });
        if (closed) stopCamera();
        else setScanning(true);
      } catch {
        if (closed) return;
        stopCamera();
        setScanning(false);
        setError('Camera access denied or not available. Use manual entry.');
        setMode('manual');
      }
    }

    void startCamera();
    return stopCamera;
  }, [mode]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualValue.trim()) {
      onScan(manualValue.trim());
      setManualValue('');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={mode === 'camera' ? 'default' : 'outline'}
            size="sm"
            type="button"
            onClick={() => { setError(''); setMode('camera'); }}
          >
            <Camera className="h-4 w-4 mr-1" /> Camera
          </Button>
          <Button
            variant={mode === 'manual' ? 'default' : 'outline'}
            size="sm"
            type="button"
            onClick={() => { setScanning(false); setMode('manual'); }}
          >
            <Keyboard className="h-4 w-4 mr-1" /> Manual
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" aria-label="Close scanner" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {mode === 'camera' && (
        <div className="relative aspect-video max-w-md mx-auto bg-black rounded-lg overflow-hidden">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {scanning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-32 border-2 border-white/70 rounded-lg" />
            </div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <Input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            aria-label="Barcode value"
            placeholder="Type or scan barcode value..."
            autoFocus
          />
          <Button type="submit">Submit</Button>
        </form>
      )}
    </div>
  );
}
