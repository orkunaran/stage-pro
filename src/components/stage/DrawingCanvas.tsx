import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Eraser, Trash2, Check } from 'lucide-react';

// Noktalar "em" biriminde saklanır (piksel / yazı boyutu). Böylece yazı
// boyutu büyüyüp küçüldüğünde (pinch-zoom, farklı cihaz) notlar sözlerle
// birlikte ölçeklenir ve aynı satırın üstünde kalır.
interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  color: string;
  size: number; // em
  isHighlighter?: boolean;
}

interface DrawingCanvasProps {
  initialData?: string;
  onSave: (data: string) => void;
  containerHeight: number;
  containerWidth: number;
  fontSize: number;
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

// Eski sürüm notları piksel olarak kaydediyordu; varsayılan yazı boyutunda
// (22px) çizildikleri varsayılarak dönüştürülür.
const LEGACY_FONT_SIZE = 22;
const round = (n: number) => Math.round(n * 100) / 100;

function parseStrokes(initialData?: string): Stroke[] {
  if (!initialData) return [];
  try {
    const data = JSON.parse(initialData);
    if (Array.isArray(data)) {
      return data.map((s: any) => ({
        ...s,
        size: (s.size || 3) / LEGACY_FONT_SIZE,
        points: (s.points || []).map((p: Point) => ({ x: p.x / LEGACY_FONT_SIZE, y: p.y / LEGACY_FONT_SIZE })),
      }));
    }
    if (data && data.v === 2 && Array.isArray(data.strokes)) return data.strokes;
  } catch {
    /* bozuk veri: boş başla */
  }
  return [];
}

function serializeStrokes(strokes: Stroke[]): string {
  if (strokes.length === 0) return '';
  return JSON.stringify({
    v: 2,
    strokes: strokes.map(s => ({
      ...s,
      size: round(s.size),
      points: s.points.map(p => ({ x: round(p.x), y: round(p.y) })),
    })),
  });
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  initialData,
  onSave,
  containerHeight,
  containerWidth,
  fontSize,
  isDrawingMode,
  onCloseDrawing,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokesState] = useState<Stroke[]>(() => parseStrokes(initialData));
  const strokesRef = useRef(strokes);
  const setStrokes = (next: Stroke[]) => {
    strokesRef.current = next;
    setStrokesState(next);
  };

  const [selectedColorIdx, setSelectedColorIdx] = useState(0);
  const [isEraser, setIsEraser] = useState(false);
  const isPaintingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, containerWidth, containerHeight);

    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size * fontSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x * fontSize, stroke.points[0].y * fontSize);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * fontSize, stroke.points[i].y * fontSize);
      }
      ctx.stroke();
    });
  }, [strokes, fontSize, containerWidth, containerHeight, dpr]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const toLocal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const eraseAt = (x: number, y: number) => {
    const next = strokesRef.current.filter(
      s => !s.points.some(p => Math.hypot(p.x * fontSize - x, p.y * fontSize - y) < 25)
    );
    if (next.length !== strokesRef.current.length) setStrokes(next);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode || !canvasRef.current) return;
    const { x, y } = toLocal(e);
    isPaintingRef.current = true;

    if (isEraser) {
      eraseAt(x, y);
      return;
    }

    const cfg = COLORS[selectedColorIdx];
    currentStrokeRef.current = {
      points: [{ x: x / fontSize, y: y / fontSize }],
      color: cfg.value,
      size: cfg.size / fontSize,
      isHighlighter: cfg.isHighlighter,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPaintingRef.current || !isDrawingMode || !canvasRef.current) return;
    const { x, y } = toLocal(e);

    if (isEraser) {
      eraseAt(x, y);
      return;
    }

    const stroke = currentStrokeRef.current;
    if (!stroke) return;
    stroke.points.push({ x: x / fontSize, y: y / fontSize });

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      const pts = stroke.points;
      const p1 = pts[pts.length - 2];
      const p2 = pts[pts.length - 1];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size * fontSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(p1.x * fontSize, p1.y * fontSize);
      ctx.lineTo(p2.x * fontSize, p2.y * fontSize);
      ctx.stroke();
    }
  };

  const handlePointerUp = () => {
    if (!isPaintingRef.current) return;
    isPaintingRef.current = false;

    if (!isEraser && currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
      const updated = [...strokesRef.current, currentStrokeRef.current];
      setStrokes(updated);
      onSave(serializeStrokes(updated));
    } else if (isEraser) {
      onSave(serializeStrokes(strokesRef.current));
    }
    currentStrokeRef.current = null;
  };

  const handleClearAll = () => {
    if (!window.confirm('Bu şarkıdaki tüm çizim ve notları silmek istiyor musunuz?')) return;
    setStrokes([]);
    onSave('');
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        width={Math.max(1, Math.round(containerWidth * dpr))}
        height={Math.max(1, Math.round(containerHeight * dpr))}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${containerWidth}px`,
          height: `${containerHeight}px`,
          zIndex: isDrawingMode ? 20 : 5,
          pointerEvents: isDrawingMode ? 'auto' : 'none',
          touchAction: isDrawingMode ? 'none' : 'auto',
          cursor: isDrawingMode ? (isEraser ? 'cell' : 'crosshair') : 'default',
        }}
      />

      {isDrawingMode && (
        <div
          data-no-swipe="true"
          style={{
            position: 'fixed',
            top: '76px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#18181b',
            border: '1px solid #3f3f46',
            borderRadius: '12px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '10px',
            zIndex: 60,
            maxWidth: 'calc(100vw - 24px)',
            boxSizing: 'border-box',
            boxShadow: '0 8px 30px rgba(0,0,0,0.8)',
          }}
        >
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
                  backgroundColor: col.isHighlighter ? (idx === 0 ? '#facc15' : '#4ade80') : col.value,
                  border: !isEraser && selectedColorIdx === idx ? '3px solid #fff' : '1px solid #52525b',
                  cursor: 'pointer',
                  transform: !isEraser && selectedColorIdx === idx ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 0.1s ease',
                }}
                title={col.name}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsEraser(prev => !prev)}
            style={{ background: isEraser ? '#fbbf24' : '#27272a', color: isEraser ? '#000' : '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Eraser size={14} /> Silgi
          </button>

          <button
            type="button"
            onClick={handleClearAll}
            style={{ background: '#27272a', color: '#ef4444', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Bu şarkıdaki tüm çizimleri temizle"
          >
            <Trash2 size={14} /> Temizle
          </button>

          <button
            type="button"
            onClick={onCloseDrawing}
            style={{ background: '#059669', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Check size={14} /> Tamam
          </button>
        </div>
      )}
    </>
  );
};
