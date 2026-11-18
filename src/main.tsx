import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './workspace/App';
import {DesktopConnectionRequired,WorkspaceBoundary} from './workspace/WorkspaceBoundary';
import './theme.css';
import './workspace-polish.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{typeof window.pteron?.call==='function'?<WorkspaceBoundary><App/></WorkspaceBoundary>:<DesktopConnectionRequired/>}</React.StrictMode>);
