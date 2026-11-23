import type { ServiceState } from '../hooks/useServiceStatus';

const LABELS: Record<ServiceState, string> = {
  checking: 'در حال بررسی سرویس…',
  ready: 'سرویس آماده است',
  not_ready: 'سرویس آماده نیست',
  unreachable: 'سرویس در دسترس نیست',
};

interface ServiceStatusProps {
  state: ServiceState;
}

export function ServiceStatus({ state }: ServiceStatusProps) {
  return (
    <div className={`service service-${state}`}>
      <span className="service-dot" aria-hidden="true" />
      <span>{LABELS[state]}</span>
    </div>
  );
}
