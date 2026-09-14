import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Eraser, Trash2, Check } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  color: string;
  size: number;
  isHighlighter?: boolean;
}

interface DrawingCanvasProps {
  initialData?: string;
  onSave: (data: string) => void;
  containerHeight: number;
  containerWidth: number;
  isDrawingMode: boolean;
  onCloseDrawing: () => void;
}

const COLORS = [
  { name: 'Sarı Fosforlu', value: 'rgba(250, 204, 21, 0.45)', isHighlighter: true, size: 18 },
  { name: 'Yeşil Fosforlu', value: 'rgba(74, 222, 128, 0.45)', isHighlighter: true, size: 18 },
  { name: 'Kırmızı Kalem', value: '#ef4444', isHighlighter: false, size: 3 },
  { name: 'Mavi Kalem', value: '#38bdf8', isHighlighter: false, size: 3 },
  { name: 'Beyaz Kalem', value: '#f3f4f6', isHighlighter: false, size: 3 },
];

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  initialData,
  onSave,
  containerHeight,
  containerWidth,
  isDrawingMode,
  onCloseDrawing,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>(() => {
    if (!initialData) return [];
    try {
      return JSON.parse(initialData);
    } catch {
      return [];
    }
  });

  const [selectedColorIdx, setSelectedColorIdx] = useState(0);
  const [isEraser, setIsEraser] = useState(false);
  const isPaintingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);

  // Çizimleri canvas'a render et
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    });
  }, [strokes]);

  useEffect(() => {
    redraw();
  }, [redraw, containerHeight, containerWidth]);

  // Çizim olayları (Stylus, Touch, Mouse)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    isPaintingRef.current = true;

    if (isEraser) {
      // Silgi: Tıklanan noktaya 25px mesafedeki çizgileri sil
      setStrokes(prev => prev.filter(s => !s.points.some(p => Math.hypot(p.x - x, p.y - y) < 25)));
      return;
    }

    const activeConfig = COLORS[selectedColorIdx];
    currentStrokeRef.current = {
      points: [{ x, y }],
      color: activeConfig.value,
      size: activeConfig.size,
      isHighlighter: activeConfig.isHighlighter,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPaintingRef.current || !isDrawingMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isEraser) {
      setStrokes(prev => prev.filter(s => !s.points.some(p => Math.hypot(p.x - x, p.y - y) < 25)));
      return;
    }

    if (currentStrokeRef.current) {
      currentStrokeRef.current.points.push({ x, y });

      const ctx = canvas.getContext('2d');
      if (ctx) {
        const pts = currentStrokeRef.current.points;
        const p1 = pts[pts.length - 2];
        const p2 = pts[pts.length - 1];

        ctx.beginPath();
        ctx.strokeStyle = currentStrokeRef.current.color;
        ctx.lineWidth = currentStrokeRef.current.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
  };

  const handlePointerUp = () => {
    if (!isPaintingRef.current) return;
    isPaintingRef.current = false;

    if (!isEraser && currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
      const updated = [...strokes, currentStrokeRef.current];
      setStrokes(updated);
      onSave(JSON.stringify(updated));
    } else if (isEraser) {
      onSave(JSON.stringify(strokes));
    }
    currentStrokeRef.current = null;
  };

  const handleClearAll = () => {
    if (!window.confirm('Tüm çizim ve notları silmek istiyor musunuz?')) return;
    setStrokes([]);
    onSave('');
  };

  return (
    <>
      {/* Canvas Çizim Katmanı */}
      <canvas
        ref={canvasRef}
        width={containerWidth}
        height={containerHeight}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: isDrawingMode ? 20 : 5,
          pointerEvents: isDrawingMode ? 'auto' : 'none',
          touchAction: isDrawingMode ? 'none' : 'auto',
          cursor: isDrawingMode ? (isEraser ? 'cell' : 'crosshair') : 'default',
        }}
      />

      {/* Çizim Modu Açıkken Görünen Yüzen Araç Kutusu */}
      {isDrawingMode && (
        <div style={{
          position: 'fixed',
          top: '76px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#18181b',
          border: '1px solid #3f3f46',
          borderRadius: '12px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          zIndex: 60,
          boxShadow: '0 8px 30px rgba(0,0,0,0.8)',
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {COLORS.map((col, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setSelectedColorIdx(idx);
                  setIsEraser(false);
                }}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: col.isHighlighter ? '#facc15' : col.value,
                  border: !isEraser && selectedColorIdx === idx ? '3px solid #fff' : '1px solid #52525b',
                  cursor: 'pointer',
                  transform: !isEraser && selectedColorIdx === idx ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 0.1s ease',
                }}
                title={col.name}
              />
            ))}
          </div>

          <div style={{ width: '1px', height: '22px', background: '#3f3f46' }} />

          <button
            type="button"
            onClick={() => setIsEraser(prev => !prev)}
            style={{
              background: isEraser ? '#fbbf24' : '#27272a',
              color: isEraser ? '#000' : '#fff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Eraser size={14} /> Silgi
          </button>

          <button
            type="button"
            onClick={handleClearAll}
            style={{
              background: '#27272a',
              color: '#ef4444',
              border: 'none',
              padding: '6px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Tüm çizimleri temizle"
          >
            <Trash2 size={14} /> Temizle
          </button>

          <div style={{ width: '1px', height: '22px', background: '#3f3f46' }} />

          <button
            type="button"
            onClick={onCloseDrawing}
            style={{
              background: '#059669',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Check size={14} /> Tamam
          </button>
        </div>
      )}
    </>
  );
};