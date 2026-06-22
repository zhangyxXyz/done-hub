// material-ui
import { Typography } from '@mui/material';

// project imports
import NavGroup from './NavGroup';
import menuItem from 'menu-items';
import { useIsAdmin } from 'utils/common';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

// ==============================|| SIDEBAR MENU LIST ||============================== //
const translateMenuItem = (item, t) => ({
  ...item,
  title: t(item.id),
  children: item.children?.map((child) => translateMenuItem(child, t))
});

const MenuList = ({ isMini = false }) => {
  const userIsAdmin = useIsAdmin();
  const { t } = useTranslation();
  const siteInfo = useSelector((state) => state.siteInfo);
  const translatedItems = menuItem.items.map((item) => translateMenuItem(item, t));

  return (
    <>
      {translatedItems.map((item) => {
        if (item.type !== 'group') {
          return (
            <Typography key={item.id} variant="h6" color="error" align="center">
              {t('menu.error')}
            </Typography>
          );
        }

        const filteredChildren = item.children.filter(
          (child) => (!child.isAdmin || userIsAdmin) && !(siteInfo.UserInvoiceMonth === false && child.id === 'invoice')
        );

        if (filteredChildren.length === 0) {
          return null;
        }

        return <NavGroup key={item.id} item={{ ...item, children: filteredChildren }} isMini={isMini} />;
      })}
    </>
  );
};

export default MenuList;
