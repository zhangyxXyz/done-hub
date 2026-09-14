import { useEffect, useState } from 'react';
import { API } from 'utils/api';
import { showError } from 'utils/common';

export default function usePriceLatestFallback() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const { data } = await API.get('/api/prices/fallback');
        if (active && data.success) setEnabled(data.data.latest_enabled === true);
      } catch (error) {
        if (active) showError(error.message);
      }
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return enabled;
}
