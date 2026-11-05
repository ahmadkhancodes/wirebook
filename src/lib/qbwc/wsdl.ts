import { QBWC_NS } from './soap';

const OPS: Record<string, { in: string[]; out: 'string' | 'int' | 'ArrayOfString' }> = {
  serverVersion: { in: [], out: 'string' },
  clientVersion: { in: ['strVersion'], out: 'string' },
  authenticate: { in: ['strUserName', 'strPassword'], out: 'ArrayOfString' },
  sendRequestXML: { in: ['ticket', 'strHCPResponse', 'strCompanyFileName', 'qbXMLCountry', 'qbXMLMajorVers', 'qbXMLMinorVers'], out: 'string' },
  receiveResponseXML: { in: ['ticket', 'response', 'hresult', 'message'], out: 'int' },
  connectionError: { in: ['ticket', 'hresult', 'message'], out: 'string' },
  getLastError: { in: ['ticket'], out: 'string' },
  closeConnection: { in: ['ticket'], out: 'string' },
};
const INT = new Set(['qbXMLMajorVers', 'qbXMLMinorVers']);

/** The eight operations of the QuickBooks Web Connector contract, as WSDL 1.1 (document/literal). */
export function wsdl(endpoint: string): string {
  const elements = Object.entries(OPS).map(([op, d]) => `
      <s:element name="${op}"><s:complexType><s:sequence>${d.in.map((a) => `<s:element minOccurs="0" maxOccurs="1" name="${a}" type="s:${INT.has(a) ? 'int' : 'string'}"/>`).join('')}</s:sequence></s:complexType></s:element>
      <s:element name="${op}Response"><s:complexType><s:sequence><s:element minOccurs="${d.out === 'int' ? 1 : 0}" maxOccurs="1" name="${op}Result" type="${d.out === 'ArrayOfString' ? 'tns:ArrayOfString' : `s:${d.out}`}"/></s:sequence></s:complexType></s:element>`).join('');
  const messages = Object.keys(OPS).map((op) => `
  <wsdl:message name="${op}SoapIn"><wsdl:part name="parameters" element="tns:${op}"/></wsdl:message>
  <wsdl:message name="${op}SoapOut"><wsdl:part name="parameters" element="tns:${op}Response"/></wsdl:message>`).join('');
  const portOps = Object.keys(OPS).map((op) => `
    <wsdl:operation name="${op}"><wsdl:input message="tns:${op}SoapIn"/><wsdl:output message="tns:${op}SoapOut"/></wsdl:operation>`).join('');
  const bindOps = Object.keys(OPS).map((op) => `
    <wsdl:operation name="${op}"><soap:operation soapAction="${QBWC_NS}${op}" style="document"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:s="http://www.w3.org/2001/XMLSchema" xmlns:tns="${QBWC_NS}" xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" targetNamespace="${QBWC_NS}">
  <wsdl:types><s:schema elementFormDefault="qualified" targetNamespace="${QBWC_NS}">${elements}
      <s:complexType name="ArrayOfString"><s:sequence><s:element minOccurs="0" maxOccurs="unbounded" name="string" nillable="true" type="s:string"/></s:sequence></s:complexType>
  </s:schema></wsdl:types>${messages}
  <wsdl:portType name="QBWebConnectorSvcSoap">${portOps}
  </wsdl:portType>
  <wsdl:binding name="QBWebConnectorSvcSoap" type="tns:QBWebConnectorSvcSoap"><soap:binding transport="http://schemas.xmlsoap.org/soap/http"/>${bindOps}
  </wsdl:binding>
  <wsdl:service name="QBWebConnectorSvc"><wsdl:port name="QBWebConnectorSvcSoap" binding="tns:QBWebConnectorSvcSoap"><soap:address location="${endpoint}"/></wsdl:port></wsdl:service>
</wsdl:definitions>
`;
}
