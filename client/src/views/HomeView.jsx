import React from "react";
import { Button, Box, Divider } from "@mui/material";

const dividerStyle = {
  width: "100%",
  color: "#fff", 
  fontWeight: "bold", 
  background: "transparent", 
  fontSize: "1.2rem", 
  textShadow: "0 1px 6px rgba(0,0,0,0.30)", 
};


const HomeView = ({ onNavigate }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      gap: 2, // Spacing between buttons
    }}
  >
    <Divider style={dividerStyle}>User</Divider>
    <Button
      variant="contained"
      size="large"
      sx={{ width: "100%" }}
      onClick={() => onNavigate("createClaim")}
    >
      Create Claim
    </Button>
    <Button
      variant="contained"
      size="large"
      sx={{ width: "100%" }}
      onClick={() => onNavigate("myClaims")}
    >
      My Claims
    </Button>
    <Divider style={dividerStyle}>Admin</Divider>
    <Button
      variant="contained"
      size="large"
      sx={{ width: "100%" }}
      onClick={() => onNavigate("manageClaim")}
    >
      Handle Claim
    </Button>
    <Button
      variant="contained"
      size="large"
      sx={{ width: "100%" }}
      onClick={() => onNavigate("findClaim")}
    >
      Find Claim
    </Button>

  </Box>
);

export default HomeView;
