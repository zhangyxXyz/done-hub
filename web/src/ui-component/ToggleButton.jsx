import { Box, ButtonBase, styled } from '@mui/material';
import PropTypes from 'prop-types';

const StyledToggleButtonGroup = styled(Box)(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  background: 'var(--aihub-soft, rgba(255, 255, 255, 0.08))',
  border: `1px solid var(--aihub-border, ${theme.palette.divider})`,
  borderRadius: '8px',
  padding: '2px',
  backdropFilter: 'blur(14px) saturate(130%)',
  WebkitBackdropFilter: 'blur(14px) saturate(130%)'
}));

const StyledToggleButton = styled(ButtonBase, {
  shouldForwardProp: (prop) => prop !== 'selected' && prop !== 'buttonSize'
})(({ theme, selected, buttonSize }) => ({
  minWidth: buttonSize === 'small' ? '36px' : '44px',
  minHeight: buttonSize === 'small' ? '28px' : '34px',
  borderRadius: '6px',
  padding: buttonSize === 'small' ? '4px 12px' : '6px 14px',
  margin: '0 2px',
  fontSize: buttonSize === 'small' ? '13px' : '14px',
  fontWeight: 500,
  lineHeight: 1.4,
  color: selected ? 'var(--aihub-link, #0877c8)' : 'var(--aihub-text, currentColor)',
  background: selected ? 'var(--aihub-selected, rgba(219, 238, 255, 0.92))' : 'transparent',
  boxShadow: selected ? `0 0 0 1px var(--aihub-link, ${theme.palette.primary.main})` : 'none',
  transition: 'background 0.2s ease-in-out, color 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
  '&:hover': {
    background: selected ? 'var(--aihub-selected-hover, rgba(204, 231, 255, 0.96))' : 'var(--aihub-soft, rgba(255, 255, 255, 0.08))'
  },
  '&.Mui-disabled': {
    opacity: 0.45,
    pointerEvents: 'none'
  }
}));

export default function ToggleButtonGroup({
  value,
  onChange,
  options = [],
  size = 'small',
  exclusive = true,
  'aria-label': ariaLabel,
  ...other
}) {
  const handleChange = (event, optionValue) => {
    if (exclusive) {
      if (optionValue !== value) {
        onChange(event, optionValue);
      }
      return;
    }

    const currentValue = Array.isArray(value) ? value : [];
    const nextValue = currentValue.includes(optionValue)
      ? currentValue.filter((item) => item !== optionValue)
      : [...currentValue, optionValue];
    onChange(event, nextValue);
  };

  return (
    <StyledToggleButtonGroup role="group" aria-label={ariaLabel} {...other}>
      {options.map((option) => {
        const selected = exclusive ? option.value === value : Array.isArray(value) && value.includes(option.value);

        return (
          <StyledToggleButton
            key={option.value}
            selected={selected}
            buttonSize={size}
            disabled={option.disabled}
            aria-pressed={selected}
            onClick={(event) => handleChange(event, option.value)}
          >
            {option.label}
          </StyledToggleButton>
        );
      })}
    </StyledToggleButtonGroup>
  );
}

ToggleButtonGroup.propTypes = {
  value: PropTypes.any,
  onChange: PropTypes.func,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.any.isRequired,
      label: PropTypes.node.isRequired,
      disabled: PropTypes.bool
    })
  ),
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  exclusive: PropTypes.bool,
  'aria-label': PropTypes.string
};
