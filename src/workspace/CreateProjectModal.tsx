import { useState } from 'react';
import { Modal } from '../components/ui/dialog';
import { Button } from '../components/ui/button';

export type CreateProjectValues = {
 name: string;
 width: number;
 height: number;
 fps: number;
};

const PRESETS = [
 { label: '16:9 Landscape', desc: '1920 × 1080 · YouTube, Video', width: 1920, height: 1080 },
 { label: '9:16 Vertical', desc: '1080 × 1920 · Shorts, Reels, TikTok', width: 1080, height: 1920 },
 { label: '1:1 Square', desc: '1080 × 1080 · Social post', width: 1080, height: 1080 },
 { label: '4:5 Portrait', desc: '1080 × 1350 · Social feed', width: 1080, height: 1350 }
] as const;

export function CreateProjectModal({
 open,
 onOpenChange,
 onCreate
}: {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onCreate: (values: CreateProjectValues) => void;
}) {
 const [name, setName] = useState('Untitled');
 const [width, setWidth] = useState(1080);
 const [height, setHeight] = useState(1920);
 const [fps, setFps] = useState(30);

 const activePreset = PRESETS.find(p => p.width === width && p.height === height);

 const handlePreset = (pWidth: number, pHeight: number) => {
  setWidth(pWidth);
  setHeight(pHeight);
 };

 const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  onCreate({
   name: name.trim() || 'Untitled',
   width: Math.max(16, Math.min(8192, width)),
   height: Math.max(16, Math.min(8192, height)),
   fps
  });
  onOpenChange(false);
 };

 return (
  <Modal title="Create a project" open={open} onOpenChange={onOpenChange} className="create-project-dialog">
   <form className="create-project-form" onSubmit={handleSubmit}>
    <label className="create-project-label">
     <span>Project name</span>
     <input
      name="name"
      aria-label="Project name"
      value={name}
      autoFocus
      onChange={e => setName(e.target.value)}
      required
      placeholder="Untitled"
     />
    </label>

    <div className="project-preset-group">
     <span className="preset-group-title">Canvas presets</span>
     <div className="preset-chips" role="group" aria-label="Resolution presets">
      {PRESETS.map(preset => {
       const isSelected = activePreset?.label === preset.label;
       return (
        <button
         key={preset.label}
         type="button"
         className={`preset-chip ${isSelected ? 'active' : ''}`}
         aria-pressed={isSelected}
         title={preset.desc}
         onClick={() => handlePreset(preset.width, preset.height)}
        >
         <span className="preset-chip-title">{preset.label}</span>
         <span className="preset-chip-dim">{preset.width} × {preset.height}</span>
        </button>
       );
      })}
     </div>
    </div>

    <div className="create-project-row">
     <label className="create-project-label">
      <span>Width (px)</span>
      <input
       name="width"
       type="number"
       aria-label="Canvas width"
       min="16"
       max="8192"
       value={width}
       onChange={e => setWidth(Number(e.target.value) || 0)}
       required
      />
     </label>
     <label className="create-project-label">
      <span>Height (px)</span>
      <input
       name="height"
       type="number"
       aria-label="Canvas height"
       min="16"
       max="8192"
       value={height}
       onChange={e => setHeight(Number(e.target.value) || 0)}
       required
      />
     </label>
     <label className="create-project-label">
      <span>Frame rate</span>
      <select
       name="fps"
       aria-label="Frame rate"
       value={fps}
       onChange={e => setFps(Number(e.target.value))}
      >
       <option value={24}>24 fps · Film</option>
       <option value={30}>30 fps · Standard</option>
       <option value={60}>60 fps · Smooth</option>
      </select>
     </label>
    </div>

    <div className="dialog-actions">
     <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
      Cancel
     </Button>
     <Button type="submit">
      Create project
     </Button>
    </div>
   </form>
  </Modal>
 );
}
