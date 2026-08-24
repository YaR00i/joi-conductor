import { useCallback, useEffect, useRef, useState } from "react";
import {
  addPixelCanvasGuide,
  clampPixelCanvasGuides,
  movePixelCanvasGuide,
  validatePixelReferenceFile,
  type PixelCanvasGuide,
  type PixelCanvasReference,
  type PixelGuideAxis,
  type PixelReferenceMode,
} from "./pixelCanvasView";
import {
  deletePixelReference,
  loadPixelReference,
  savePixelReference,
} from "./pixelReferenceStore";

let nextGuideId = 1;

type PixelCanvasViewOptions = {
  /** Persist a reference image for this editor document in IndexedDB. */
  referenceKey?: string | null;
};

export function usePixelCanvasView(options: PixelCanvasViewOptions = {}) {
  const [gridVisible, setGridVisible] = useState(true);
  const [gridStep, setGridStep] = useState(1);
  const [gridOpacity, setGridOpacity] = useState(14);
  const [guidesVisible, setGuidesVisible] = useState(true);
  const [guides, setGuides] = useState<PixelCanvasGuide[]>([]);
  const [reference, setReference] = useState<PixelCanvasReference | null>(null);
  const referenceUrlRef = useRef<string | null>(null);
  const referenceBlobRef = useRef<Blob | null>(null);
  const referenceLoadGenerationRef = useRef(0);
  const referenceSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revokeReferenceUrl = useCallback(() => {
    if (referenceUrlRef.current) URL.revokeObjectURL(referenceUrlRef.current);
    referenceUrlRef.current = null;
  }, []);

  useEffect(() => () => {
    revokeReferenceUrl();
    if (referenceSaveTimerRef.current) clearTimeout(referenceSaveTimerRef.current);
  }, [revokeReferenceUrl]);

  useEffect(() => {
    const key = options.referenceKey;
    const generation = ++referenceLoadGenerationRef.current;
    revokeReferenceUrl();
    referenceBlobRef.current = null;
    setReference(null);
    if (!key) return;
    void loadPixelReference(key)
      .then((stored) => {
        if (!stored || generation !== referenceLoadGenerationRef.current) return;
        const url = URL.createObjectURL(stored.blob);
        referenceUrlRef.current = url;
        referenceBlobRef.current = stored.blob;
        setReference({
          url,
          name: stored.name,
          mode: stored.mode,
          opacity: stored.opacity,
          scale: stored.scale,
          offsetX: stored.offsetX,
          offsetY: stored.offsetY,
          mirror: stored.mirror,
        });
      })
      .catch(() => undefined);
  }, [options.referenceKey, revokeReferenceUrl]);

  useEffect(() => {
    const key = options.referenceKey;
    const blob = referenceBlobRef.current;
    if (!key || !blob || !reference) return;
    if (referenceSaveTimerRef.current) clearTimeout(referenceSaveTimerRef.current);
    referenceSaveTimerRef.current = setTimeout(() => {
      referenceSaveTimerRef.current = null;
      void savePixelReference(key, blob, reference).catch(() => undefined);
    }, 150);
    return () => {
      if (referenceSaveTimerRef.current) clearTimeout(referenceSaveTimerRef.current);
      referenceSaveTimerRef.current = null;
      void savePixelReference(key, blob, reference).catch(() => undefined);
    };
  }, [options.referenceKey, reference]);

  const setReferenceFile = useCallback((file: File | null): string | null => {
    if (!file) return null;
    const error = validatePixelReferenceFile(file);
    if (error) return error;
    revokeReferenceUrl();
    const url = URL.createObjectURL(file);
    referenceUrlRef.current = url;
    referenceBlobRef.current = file;
    setReference({
      url,
      name: file.name,
      mode: "over",
      opacity: 35,
      scale: 100,
      offsetX: 0,
      offsetY: 0,
      mirror: false,
    });
    return null;
  }, [revokeReferenceUrl]);

  const removeReference = useCallback(() => {
    revokeReferenceUrl();
    referenceBlobRef.current = null;
    setReference(null);
    if (options.referenceKey) {
      void deletePixelReference(options.referenceKey).catch(() => undefined);
    }
  }, [options.referenceKey, revokeReferenceUrl]);

  const updateReference = useCallback((patch: Partial<Omit<PixelCanvasReference, "url" | "name">>) => {
    setReference((current) => current ? { ...current, ...patch } : current);
  }, []);

  const addGuide = useCallback((axis: PixelGuideAxis, position: number, extent: number) => {
    const id = `guide_${nextGuideId++}`;
    setGuides((current) => addPixelCanvasGuide(current, axis, position, extent, id));
  }, []);

  const moveGuide = useCallback((id: string, position: number, extent: number) => {
    setGuides((current) => movePixelCanvasGuide(current, id, position, extent));
  }, []);

  const removeGuide = useCallback((id: string) => {
    setGuides((current) => current.filter((guide) => guide.id !== id));
  }, []);

  const clampGuides = useCallback((width: number, height: number) => {
    setGuides((current) => {
      const next = clampPixelCanvasGuides(current, width, height);
      return next.length === current.length && next.every((guide, index) => (
        guide.id === current[index]?.id && guide.position === current[index]?.position
      )) ? current : next;
    });
  }, []);

  const setReferenceMode = useCallback((mode: PixelReferenceMode) => updateReference({ mode }), [updateReference]);

  return {
    gridVisible,
    setGridVisible,
    gridStep,
    setGridStep,
    gridOpacity,
    setGridOpacity,
    guidesVisible,
    setGuidesVisible,
    guides,
    setGuides,
    addGuide,
    moveGuide,
    removeGuide,
    clampGuides,
    reference,
    setReferenceFile,
    removeReference,
    updateReference,
    setReferenceMode,
  };
}
