import type { NextFunction, Request, Response } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/mysql";
import { forbidden, unauthorized } from "../shared/errors";

export type AuthUser = {
  id: number;
  personId: number;
  email: string;
  username: string;
  status: string;
  roles: string[];
};

declare global {
  namespace Express {
    interface Locals {
      authUser?: AuthUser;
    }
  }
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  try {
    if (!request.session.userId) {
      next(unauthorized());
      return;
    }

    const [userRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, person_id AS personId, email, username, status
       FROM users
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [request.session.userId]
    );
    const user = userRows[0];

    if (!user || user.status !== "active") {
      request.session.destroy(() => undefined);
      next(unauthorized());
      return;
    }

    const [roleRows] = await pool.execute<RowDataPacket[]>(
      `SELECT roles.name
       FROM roles
       INNER JOIN user_roles ON roles.id = user_roles.role_id
       WHERE user_roles.user_id = ?`,
      [user.id]
    );
    const roles = roleRows.map((role) => String(role.name));

    response.locals.authUser = {
      id: Number(user.id),
      personId: Number(user.personId),
      email: user.email,
      username: user.username,
      status: user.status,
      roles
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function requireAnyRole(allowedRoles: string[]) {
  return (_request: Request, response: Response, next: NextFunction) => {
    const user = response.locals.authUser;
    if (!user) {
      next(unauthorized());
      return;
    }

    if (!user.roles.some((role) => allowedRoles.includes(role))) {
      next(forbidden());
      return;
    }

    next();
  };
}
