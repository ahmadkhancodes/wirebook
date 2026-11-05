const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface QwcInput {
  appName: string;
  /** must be https, except localhost for development */
  appUrl: string;
  appDescription: string;
  appSupport: string;
  username: string;
  ownerGuid: string;
  fileGuid: string;
  runEveryNSeconds?: number;
}

/** QuickBooks Web Connector .qwc file. OwnerID and FileID are unique per end user. */
export function generateQwc(i: QwcInput): string {
  const u = new URL(i.appUrl);
  if (u.protocol !== 'https:' && u.hostname !== 'localhost') throw new Error('appUrl must be https');
  const guid = /^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?$/;
  if (!guid.test(i.ownerGuid) || !guid.test(i.fileGuid)) throw new Error('ownerGuid and fileGuid must be GUIDs');
  const wrap = (g: string) => (g.startsWith('{') ? g : `{${g}}`);
  return `<?xml version="1.0"?>
<QBWCXML>
  <AppName>${esc(i.appName)}</AppName>
  <AppID></AppID>
  <AppURL>${esc(i.appUrl)}</AppURL>
  <AppDescription>${esc(i.appDescription)}</AppDescription>
  <AppSupport>${esc(i.appSupport)}</AppSupport>
  <UserName>${esc(i.username)}</UserName>
  <OwnerID>${esc(wrap(i.ownerGuid))}</OwnerID>
  <FileID>${esc(wrap(i.fileGuid))}</FileID>
  <QBType>QBFS</QBType>
  <Style>Document</Style>
  <Scheduler>
    <RunEveryNSeconds>${Math.max(10, Math.floor(i.runEveryNSeconds ?? 60))}</RunEveryNSeconds>
  </Scheduler>
  <IsReadOnly>false</IsReadOnly>
</QBWCXML>
`;
}
