import React from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';

/**
 * Custom Windows Logo Icon - Four-pane design
 * Matches Material-UI icon interface for consistent styling
 */
export const WindowsIcon: React.FC<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      {/* Top-left pane */}
      <rect x="3" y="3" width="8" height="8" rx="0.5" />
      {/* Bottom-left pane */}
      <rect x="3" y="13" width="8" height="8" rx="0.5" />
      {/* Top-right pane */}
      <rect x="13" y="3" width="8" height="8" rx="0.5" />
      {/* Bottom-right pane */}
      <rect x="13" y="13" width="8" height="8" rx="0.5" />
    </SvgIcon>
  );
};
