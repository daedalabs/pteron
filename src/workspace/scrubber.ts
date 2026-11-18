/**
 * Interactive scrub utility for workstation numeric labels.
 * Dragging horizontally adjusts values smoothly; a direct click focuses the input.
 */
export function onScrubPointerDown(event: React.PointerEvent<HTMLElement>, stepOverride?: number) {
 if (event.button !== 0) return;
 const target = event.currentTarget;
 const container = target.closest('label') ?? target.parentElement;
 const input = container?.querySelector<HTMLInputElement>('input[type=number]');
 if (!input || input.disabled || input.readOnly) return;

 event.preventDefault();
 event.stopPropagation();
 target.setPointerCapture(event.pointerId);

 const startX = event.clientX;
 const startVal = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : (parseFloat(input.value) || 0);
 const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
 const max = input.max !== '' ? parseFloat(input.max) : Infinity;
 const baseStep = stepOverride ?? (input.step && input.step !== 'any' ? parseFloat(input.step) : 1);
 let dragged = false;

 const onPointerMove = (e: PointerEvent) => {
  const dx = e.clientX - startX;
  if (Math.abs(dx) >= 3) {
   dragged = true;
   const multiplier = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
   const step = baseStep * multiplier;
   let next = startVal + dx * step;
   next = Math.max(min, Math.min(max, next));
   const decimals = (String(baseStep).split('.')[1]?.length ?? 0) + (e.altKey ? 1 : 0);
   const nextStr = Number(next.toFixed(Math.min(4, Math.max(0, decimals)))).toString();
   const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
   if (nativeSetter) {
    nativeSetter.call(input, nextStr);
   } else {
    input.value = nextStr;
   }
   input.dispatchEvent(new Event('input', { bubbles: true }));
   input.dispatchEvent(new Event('change', { bubbles: true }));
  }
 };

 const onPointerUp = () => {
  target.removeEventListener('pointermove', onPointerMove);
  target.removeEventListener('pointerup', onPointerUp);
  target.removeEventListener('pointercancel', onPointerUp);
  try { target.releasePointerCapture(event.pointerId); } catch {}

  if (dragged) {
   input.focus();
   input.blur();
  } else {
   input.focus();
   input.select();
  }
 };

 target.addEventListener('pointermove', onPointerMove);
 target.addEventListener('pointerup', onPointerUp);
 target.addEventListener('pointercancel', onPointerUp);
}
