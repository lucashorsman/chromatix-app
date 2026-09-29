// ======================================================================
// IMPORTS
// ======================================================================

import clsx from 'clsx';

import { Icon } from 'js/components';

import style from './ActionToggle.module.scss';

// ======================================================================
// COMPONENT
// ======================================================================

export const ActionToggle = ({ variant, value, options, setter, icon = 'ArrowsVerticalIcon' }) => {
  const handleValueChange = () => {
    const currentIndex = options.findIndex((option) => option.value === value);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % options.length : 0;
    setter(options[nextIndex].value);
  };

  const currentOption = options.find((option) => option.value === value);
  const currentIcon = currentOption?.icon || icon;
  const valueString = currentOption?.label;

  return (
    <div className={clsx(style.wrap, style['wrap' + variant])}>
      <button type="button" className={style.trigger} onClick={handleValueChange} aria-label={valueString}>
        <span className={style.icon}>
          <Icon icon={currentIcon} cover stroke />
        </span>
        <span className={style.label}>{valueString}</span>
      </button>
    </div>
  );
};

// ======================================================================
// EXPORT
// ======================================================================

export default ActionToggle;
