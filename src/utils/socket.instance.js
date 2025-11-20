// Socket instance module to avoid circular dependencies
let ioInstance = null;

export const setSocketInstance = (io) => {
  ioInstance = io;
};

export const getSocketInstance = () => {
  return ioInstance;
};

