export class KeyNotFoundInStorageError extends Error {
  public componentType: string;
  public key: string;

  public constructor(key: string, componentType: string) {
    super(`Key ${key} not found in storage`);
    this.key = key;
    this.componentType = componentType;
  }
}

export class DuplicateKeyError extends Error {
  public componentType: string;
  public key: string;

  public constructor(key: string, componentType: string) {
    super(`Key ${key} is duplicate in storage`);
    this.key = key;
    this.componentType = componentType;
  }
}

export class TargetPropertyNotFoundError extends Error {
  public componentName: string;

  public constructor(componentName: string) {
    super(`Target property not found for component ${componentName}`);
    this.componentName = componentName;
  }
}

export class ProcessingError extends Error {
  public componentType: string;
  public key: string;

  public constructor(key: string, componentType: string) {
    super(`Key ${key} can not be processed`);
    this.key = key;
    this.componentType = componentType;
  }
}
