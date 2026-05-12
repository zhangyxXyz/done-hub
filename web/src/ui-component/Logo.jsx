// material-ui
import logoDark from 'assets/images/ai-hub-dark.svg';
import logoLight from 'assets/images/ai-hub-light.svg';
import { useSelector } from 'react-redux';
import { useTheme } from '@mui/material/styles';

/**
 * if you want to use image instead of <svg> uncomment following.
 *
 * import logoDark from 'assets/images/logo-dark.svg';
 * import logo from 'assets/images/logo.svg';
 *
 */

// ==============================|| LOGO SVG ||============================== //

const Logo = () => {
  const siteInfo = useSelector((state) => state.siteInfo);
  const theme = useTheme();
  const defaultLogo = theme.palette.mode === 'light' ? logoLight : logoDark;

  if (siteInfo.isLoading) {
    return null; // 数据加载未完成时不显示 logo
  }

  const logoToDisplay = siteInfo.logo ? siteInfo.logo : defaultLogo;

  return <img src={logoToDisplay} alt={siteInfo.system_name} height="50" />;
};

export default Logo;
