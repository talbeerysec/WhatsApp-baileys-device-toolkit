import React from 'react';
import { Box, Typography, Tooltip, IconButton } from '@mui/material';
import { ContentCopy as CopyIcon } from '@mui/icons-material';

interface InfoFieldProps {
  label: string;
  value: string | undefined;
  monospace?: boolean;
  tooltip?: string;
  maxLength?: number;
}

export const InfoField: React.FC<InfoFieldProps> = ({
  label,
  value,
  monospace = false,
  tooltip,
  maxLength
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    if (value) {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const displayValue = value || 'N/A';

  const fieldContent = (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          variant="body2"
          sx={{
            fontFamily: monospace ? 'monospace' : 'inherit',
            wordBreak: 'break-all',
            fontSize: monospace ? '0.85rem' : '0.875rem',
            flex: 1
          }}
        >
          {displayValue}
        </Typography>
        {value && value !== 'N/A' && (
          <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
            <IconButton
              size="small"
              onClick={handleCopy}
              sx={{ p: 0.5 }}
            >
              <CopyIcon sx={{ fontSize: '1rem' }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );

  return tooltip ? (
    <Tooltip title={tooltip} placement="top-start">
      {fieldContent}
    </Tooltip>
  ) : (
    fieldContent
  );
};
