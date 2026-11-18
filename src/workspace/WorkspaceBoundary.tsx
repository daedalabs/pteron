import {Component,type ReactNode} from 'react';
import {Button} from '../components/ui/button';
export function DesktopConnectionRequired(){return <main className="startup-status" role="status"><h1>Open pteron in its desktop window</h1><p>This browser page has no desktop connection.</p><p>Run <code>npm run dev</code> and use the pteron window with developer commands under Help. Changes refresh in that window.</p></main>;}
export class WorkspaceBoundary extends Component<{children:ReactNode},{error:string|null}>{
 state:{error:string|null}={error:null};
 static getDerivedStateFromError(error:Error){return {error:error.message};}
 render(){return this.state.error?<main className="startup-status" role="alert"><h1>The interface could not load</h1><p>{this.state.error}</p><Button variant="outline" onClick={()=>location.reload()}>Reload interface</Button></main>:this.props.children;}
}
