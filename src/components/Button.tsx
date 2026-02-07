import type { FC, ReactNode } from 'react';
import { Button as ButtonComponent } from "@mantine/core";

const Button: FC<{ children: ReactNode; variant?: string, size?: string; onClick: any }> = ({ children, variant, size, onClick }) => (
  <ButtonComponent
    variant={variant}
    size={size}
    onClick={onClick}
  >
    {children}
  </ButtonComponent>
)

export default Button;
