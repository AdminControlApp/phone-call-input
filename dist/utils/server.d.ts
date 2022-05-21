interface StartAppServerProps {
    port: number;
    shouldAutoInputPasscode: boolean;
}
export declare function startAppServer({ port, shouldAutoInputPasscode, }: StartAppServerProps): Promise<string>;
export {};
