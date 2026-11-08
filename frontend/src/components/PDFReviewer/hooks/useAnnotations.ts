import { useState, useCallback, useRef } from 'react';
import { Annotation, AnnotationStyle, DEFAULT_ANNOTATION_STYLE } from '../types';

interface UseAnnotationsReturn {
  annotations: Annotation[];
  activeStyle: AnnotationStyle;
  undoStack: Annotation[][];
  redoStack: Annotation[][];
  addAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  setActiveStyle: (style: Partial<AnnotationStyle>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clearAnnotations: () => void;
  getAnnotationsForPage: (pageNumber: number) => Annotation[];
}

export function useAnnotations(initialAnnotations: Annotation[] = []): UseAnnotationsReturn {
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [activeStyle, setActiveStyleState] = useState<AnnotationStyle>(DEFAULT_ANNOTATION_STYLE);
  const undoStackRef = useRef<Annotation[][]>([]);
  const redoStackRef = useRef<Annotation[][]>([]);
  const [, forceUpdate] = useState({});

  const saveToUndoStack = useCallback(() => {
    undoStackRef.current.push([...annotations]);
    redoStackRef.current = [];
    forceUpdate({});
  }, [annotations]);

  const addAnnotation = useCallback((annotation: Annotation) => {
    saveToUndoStack();
    setAnnotations(prev => [...prev, annotation]);
  }, [saveToUndoStack]);

  const removeAnnotation = useCallback((id: string) => {
    saveToUndoStack();
    setAnnotations(prev => prev.filter(a => a.id !== id));
  }, [saveToUndoStack]);

  const updateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
    saveToUndoStack();
    setAnnotations(prev => 
      prev.map(a => a.id === id ? { ...a, ...updates } as Annotation : a)
    );
  }, [saveToUndoStack]);

  const setActiveStyle = useCallback((style: Partial<AnnotationStyle>) => {
    setActiveStyleState(prev => ({ ...prev, ...style }));
  }, []);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    
    const previousState = undoStackRef.current.pop()!;
    redoStackRef.current.push([...annotations]);
    setAnnotations(previousState);
    forceUpdate({});
  }, [annotations]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    
    const nextState = redoStackRef.current.pop()!;
    undoStackRef.current.push([...annotations]);
    setAnnotations(nextState);
    forceUpdate({});
  }, [annotations]);

  const clearAnnotations = useCallback(() => {
    saveToUndoStack();
    setAnnotations([]);
  }, [saveToUndoStack]);

  const getAnnotationsForPage = useCallback((pageNumber: number) => {
    return annotations.filter(a => a.pageNumber === pageNumber);
  }, [annotations]);

  return {
    annotations,
    activeStyle,
    undoStack: undoStackRef.current,
    redoStack: redoStackRef.current,
    addAnnotation,
    removeAnnotation,
    updateAnnotation,
    setActiveStyle,
    undo,
    redo,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    clearAnnotations,
    getAnnotationsForPage,
  };
}
