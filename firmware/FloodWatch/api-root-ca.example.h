#pragma once
// For an HTTPS API, copy this file to api-root-ca.h. Replace the empty string
// with the trusted CA certificate in PEM format, including the BEGIN and END lines.
// A C++ raw string literal preserves the PEM's original line breaks.
constexpr char API_ROOT_CA[] = "";
