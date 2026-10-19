import type { FC, MouseEventHandler, ReactNode } from 'react';
import { Button as ButtonComponent } from "@mantine/core";

interface ButtonProps {
  children: ReactNode;
  variant?: string;
  size?: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

const Button: FC<ButtonProps> = ({
  children,
  variant,
  size,
  onClick,
}) => (
  <ButtonComponent
    variant={variant}
    size={size}
    onClick={onClick}
  >
    {children}
  </ButtonComponent>
)

export default Button;
