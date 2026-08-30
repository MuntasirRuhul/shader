import type { ParameterValue, ParameterValues } from '@shader/core';
import { useEffect, useState } from 'react';
import { transientChannel } from '../store/transientChannel';

/**
 * The values a drag has published but not yet committed, for one object.
 *
 * A controlled slider draws its thumb from the `value` it is given. Values
 * mid-drag live only in the transient channel, so without this the thumb would
 * snap back to the document's value on every pointer move and the drag would
 * appear dead.
 *
 * This does re-render the panel while a drag is in progress — a handful of
 * small controls. The canvas is still driven straight from the channel and
 * never waits on React, which is the path that has to stay clear.
 */
export function useTransientValues(objectId: string): ParameterValues {
  const [values, setValues] = useState<ParameterValues>({});

  useEffect(() => {
    return transientChannel.subscribe((edits) => {
      const next: Record<string, ParameterValue> = {};
      for (const edit of edits) {
        if (edit.objectId === objectId) next[edit.key] = edit.value as ParameterValue;
      }
      setValues(next);
    });
  }, [objectId]);

  return values;
}
