import { PhasePendingState } from '@/components/ui/states';
import { NAV_ITEM_BY_ID, type ViewId } from '@/lib/constants/navigation';

/**
 * Stand-in for a view whose phase has not been built yet. It names the view,
 * its intended data source and the phase that delivers it — deliberately
 * rather than rendering mock content.
 */
export function PendingView({ viewId }: { viewId: ViewId }) {
  const item = NAV_ITEM_BY_ID[viewId];

  return (
    <PhasePendingState
      title={item.label}
      description={item.description}
      phase={item.phase}
    />
  );
}
