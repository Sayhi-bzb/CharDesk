import type { GridAddress, GridBounds } from "./static-grid";

export interface StaticGridInputSession {
  origin: GridAddress;
  nextCell: GridAddress;
  activeCell: GridAddress;
  previousCell: GridAddress | null;
  exhausted: boolean;
}

interface StaticGridInputStep {
  session: StaticGridInputSession;
  writeAt: GridAddress | null;
}

const clampAddressToBounds = (
  address: GridAddress,
  bounds?: GridBounds | null
): GridAddress => bounds ? {
  x: Math.max(bounds.start.x, Math.min(bounds.end.x, address.x)),
  y: Math.max(bounds.start.y, Math.min(bounds.end.y, address.y)),
} : { ...address };

export const createStaticGridInputSession = (input: {
  origin: GridAddress;
  bounds?: GridBounds | null;
}): StaticGridInputSession => {
  const origin = clampAddressToBounds(input.origin, input.bounds);
  return {
    origin,
    nextCell: { ...origin },
    activeCell: { ...origin },
    previousCell: null,
    exhausted: false,
  };
};

const exhaustStaticGridInputSession = (
  session: StaticGridInputSession,
  nextCell = session.nextCell
): StaticGridInputSession => ({
  ...session,
  nextCell: { ...nextCell },
  exhausted: true,
});

export const advanceStaticGridInput = (input: {
  session: StaticGridInputSession;
  width: 1 | 2;
  bounds?: GridBounds | null;
}): StaticGridInputStep => {
  const { bounds, width } = input;
  if (input.session.exhausted) {
    return { session: input.session, writeAt: null };
  }

  let writeAt = { ...input.session.nextCell };
  if (bounds) {
    const fitsRow = (point: GridAddress) =>
      point.x >= bounds.start.x
      && point.x + width - 1 <= bounds.end.x
      && point.y >= bounds.start.y
      && point.y <= bounds.end.y;

    if (!fitsRow(writeAt)) {
      const wrapped = {
        x: input.session.origin.x,
        y: writeAt.y + 1,
      };
      if (writeAt.x === input.session.origin.x || !fitsRow(wrapped)) {
        return {
          session: exhaustStaticGridInputSession(input.session),
          writeAt: null,
        };
      }
      writeAt = wrapped;
    }
  }

  const nextX = writeAt.x + width;
  if (!bounds || nextX <= bounds.end.x) {
    const nextCell = { x: nextX, y: writeAt.y };
    return {
      writeAt,
      session: {
        ...input.session,
        nextCell,
        activeCell: nextCell,
        previousCell: writeAt,
      },
    };
  }

  const nextCell = {
    x: input.session.origin.x,
    y: writeAt.y + 1,
  };
  if (nextCell.y <= bounds.end.y) {
    return {
      writeAt,
      session: {
        ...input.session,
        nextCell,
        activeCell: nextCell,
        previousCell: writeAt,
      },
    };
  }

  return {
    writeAt,
    session: {
      ...exhaustStaticGridInputSession(input.session, nextCell),
      activeCell: writeAt,
      previousCell: writeAt,
    },
  };
};

export const advanceStaticGridInputLine = (input: {
  session: StaticGridInputSession;
  bounds?: GridBounds | null;
}): StaticGridInputSession => {
  if (input.session.exhausted) return input.session;
  const nextCell = {
    x: input.session.origin.x,
    y: input.session.nextCell.y + 1,
  };
  if (input.bounds && nextCell.y > input.bounds.end.y) {
    return exhaustStaticGridInputSession(input.session, nextCell);
  }
  return {
    ...input.session,
    nextCell,
    activeCell: nextCell,
  };
};
