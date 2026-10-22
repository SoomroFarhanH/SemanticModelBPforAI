import { AppView } from './AppView';
import { useRuns } from './hooks/use-runs';

function App() {
  const api = useRuns();
  return <AppView api={api} />;
}

export default App;
