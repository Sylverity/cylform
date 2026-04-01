import { useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { MoleculeInfo } from '../App';

interface MoleculeCanvasProps {
  onMoleculeLoaded: (info: MoleculeInfo) => void;
  onError: (error: string) => void;
  isLoading: boolean;
}

export function MoleculeCanvas({ onMoleculeLoaded, onError, isLoading }: MoleculeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const buttonRef = useRef<number>(0);

  // Handle mouse events for camera control
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    buttonRef.current = e.button;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    
    // Prevent text selection while dragging
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    
    const deltaX = e.clientX - lastPosRef.current.x;
    const deltaY = e.clientY - lastPosRef.current.y;
    
    if (buttonRef.current === 0) {
      // Left click - rotate
      invoke('camera_rotate', { deltaX: deltaX * 0.01, deltaY: deltaY * 0.01 }).catch(console.error);
    } else if (buttonRef.current === 2) {
      // Right click - pan
      invoke('camera_pan', { deltaX: deltaX * 0.01, deltaY: -deltaY * 0.01 }).catch(console.error);
    }
    
    lastPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    buttonRef.current = 0;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.1 : -0.1;
    invoke('camera_zoom', { delta }).catch(console.error);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        invoke('camera_reset').catch(console.error);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle reset camera event
  useEffect(() => {
    const handleReset = () => {
      invoke('camera_reset').catch(console.error);
    };
    
    window.addEventListener('reset-camera', handleReset);
    return () => window.removeEventListener('reset-camera', handleReset);
  }, []);

  // Initialize canvas and wgpu surface
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    
    // Set canvas size to match container
    const resizeCanvas = () => {
      if (containerRef.current && canvas) {
        const rect = containerRef.current.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        // Notify Rust backend of resize
        invoke('resize_surface', { 
          width: Math.max(1, Math.floor(rect.width)), 
          height: Math.max(1, Math.floor(rect.height)) 
        }).catch(console.error);
      }
    };

    resizeCanvas();
    
    // Observe resize
    const resizeObserver = new ResizeObserver(resizeCanvas);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Initialize the wgpu renderer
    const initRenderer = async () => {
      try {
        // Get the raw window handle via Tauri
        await invoke('init_renderer');
      } catch (err) {
        console.error('Failed to initialize renderer:', err);
        onError('Failed to initialize GPU renderer');
      }
    };

    initRenderer();

    return () => {
      resizeObserver.disconnect();
    };
  }, [onError]);

  return (
    <div ref={containerRef} className="molecule-canvas">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      />
      
      {!isLoading && (
        <div className="canvas-overlay" style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          pointerEvents: 'none',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          Left drag: Rotate | Right drag: Pan | Scroll: Zoom
        </div>
      )}
    </div>
  );
}
