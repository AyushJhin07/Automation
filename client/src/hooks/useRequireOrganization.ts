import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export const useRequireOrganization = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);
  const activeOrganizationId = useAuthStore((state) => state.activeOrganizationId);

  useEffect(() => {
    if (!initialized) return;
    if (!user) return;
    if (!activeOrganizationId) {
      const redirectPath = encodeURIComponent(`${location.pathname}${location.search}`);
      if (!location.pathname.startsWith('/workspaces')) {
        navigate(`/workspaces?redirect=${redirectPath}`, { replace: true });
      }
    }
  }, [initialized, activeOrganizationId, navigate, location.pathname, location.search, user]);

  return Boolean(activeOrganizationId);
};

export default useRequireOrganization;
