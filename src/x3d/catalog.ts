// Generated from official Web3D X3DUOM 3.3 and X3D 3.3 XSD. Do not hand edit.
export const catalogProvenance = {
  "modelUrl": "https://www.web3d.org/specifications/X3dUnifiedObjectModel-3.3.xml",
  "modelSha256": "6d9561c4398512e9a891e1221667b6a11994c20979aa4bbcabc21cbf056c0eae",
  "schemaUrl": "https://www.web3d.org/specifications/x3d-3.3.xsd",
  "schemaSha256": "a687b059a480a599b4bba0ca78c20ed17202ffe06450c24379833e3a26fe875b"
} as const;
export const catalog = {
  "Anchor": {
    "containerField": "children",
    "fields": {
      "bboxCenter": {
        "type": "SFVec3f",
        "accessType": "initializeOnly",
        "default": "0 0 0"
      },
      "bboxSize": {
        "type": "SFVec3f",
        "accessType": "initializeOnly",
        "default": "-1 -1 -1"
      },
      "children": {
        "type": "MFNode",
        "accessType": "inputOutput"
      },
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "description": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "parameter": {
        "type": "MFString",
        "accessType": "inputOutput"
      },
      "url": {
        "type": "MFString",
        "accessType": "inputOutput"
      }
    }
  },
  "Appearance": {
    "containerField": "appearance",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "fillProperties": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "lineProperties": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "material": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "shaders": {
        "type": "MFNode",
        "accessType": "inputOutput"
      },
      "texture": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "textureTransform": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      }
    }
  },
  "Background": {
    "containerField": "children",
    "fields": {
      "backUrl": {
        "type": "MFString",
        "accessType": "inputOutput"
      },
      "bottomUrl": {
        "type": "MFString",
        "accessType": "inputOutput"
      },
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "frontUrl": {
        "type": "MFString",
        "accessType": "inputOutput"
      },
      "groundAngle": {
        "type": "MFFloat",
        "accessType": "inputOutput"
      },
      "groundColor": {
        "type": "MFColor",
        "accessType": "inputOutput"
      },
      "leftUrl": {
        "type": "MFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "rightUrl": {
        "type": "MFString",
        "accessType": "inputOutput"
      },
      "skyAngle": {
        "type": "MFFloat",
        "accessType": "inputOutput"
      },
      "skyColor": {
        "type": "MFColor",
        "accessType": "inputOutput",
        "default": "0 0 0"
      },
      "topUrl": {
        "type": "MFString",
        "accessType": "inputOutput"
      },
      "transparency": {
        "type": "SFFloat",
        "accessType": "inputOutput",
        "default": "0"
      }
    }
  },
  "BooleanFilter": {
    "containerField": "children",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      }
    }
  },
  "BooleanTrigger": {
    "containerField": "children",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "solid": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      }
    }
  },
  "Box": {
    "containerField": "geometry",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "size": {
        "type": "SFVec3f",
        "accessType": "initializeOnly",
        "default": "2 2 2"
      },
      "solid": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      }
    }
  },
  "ColorInterpolator": {
    "containerField": "children",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "key": {
        "type": "MFFloat",
        "accessType": "inputOutput"
      },
      "keyValue": {
        "type": "MFColor",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      }
    }
  },
  "Coordinate": {
    "containerField": "coord",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "point": {
        "type": "MFVec3f",
        "accessType": "inputOutput"
      }
    }
  },
  "Cylinder": {
    "containerField": "geometry",
    "fields": {
      "bottom": {
        "type": "SFBool",
        "accessType": "inputOutput",
        "default": "true"
      },
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "height": {
        "type": "SFFloat",
        "accessType": "initializeOnly",
        "default": "2"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "radius": {
        "type": "SFFloat",
        "accessType": "initializeOnly",
        "default": "1"
      },
      "side": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      },
      "solid": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      },
      "top": {
        "type": "SFBool",
        "accessType": "inputOutput",
        "default": "true"
      }
    }
  },
  "FontStyle": {
    "containerField": "fontStyle",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "family": {
        "type": "MFString",
        "accessType": "initializeOnly",
        "default": "\"SERIF\""
      },
      "horizontal": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      },
      "justify": {
        "type": "MFString",
        "accessType": "initializeOnly",
        "default": "\"BEGIN\""
      },
      "language": {
        "type": "SFString",
        "accessType": "initializeOnly"
      },
      "leftToRight": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "size": {
        "type": "SFFloat",
        "accessType": "initializeOnly",
        "default": "1.0"
      },
      "spacing": {
        "type": "SFFloat",
        "accessType": "initializeOnly",
        "default": "1.0"
      },
      "style": {
        "type": "SFString",
        "accessType": "initializeOnly",
        "default": "PLAIN"
      },
      "topToBottom": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      }
    }
  },
  "Group": {
    "containerField": "children",
    "fields": {
      "bboxCenter": {
        "type": "SFVec3f",
        "accessType": "initializeOnly",
        "default": "0 0 0"
      },
      "bboxSize": {
        "type": "SFVec3f",
        "accessType": "initializeOnly",
        "default": "-1 -1 -1"
      },
      "children": {
        "type": "MFNode",
        "accessType": "inputOutput"
      },
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      }
    }
  },
  "ImageTexture": {
    "containerField": "texture",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "repeatS": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      },
      "repeatT": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      },
      "textureProperties": {
        "type": "SFNode",
        "accessType": "initializeOnly",
        "default": "NULL"
      },
      "url": {
        "type": "MFString",
        "accessType": "inputOutput"
      }
    }
  },
  "IndexedFaceSet": {
    "containerField": "geometry",
    "fields": {
      "attrib": {
        "type": "MFNode",
        "accessType": "inputOutput"
      },
      "ccw": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      },
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "color": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "colorIndex": {
        "type": "MFInt32",
        "accessType": "initializeOnly"
      },
      "colorPerVertex": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      },
      "convex": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      },
      "coord": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "coordIndex": {
        "type": "MFInt32",
        "accessType": "initializeOnly"
      },
      "creaseAngle": {
        "type": "SFFloat",
        "accessType": "initializeOnly",
        "default": "0"
      },
      "fogCoord": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "normal": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "normalIndex": {
        "type": "MFInt32",
        "accessType": "initializeOnly"
      },
      "normalPerVertex": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      },
      "solid": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      },
      "texCoord": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "texCoordIndex": {
        "type": "MFInt32",
        "accessType": "initializeOnly"
      }
    }
  },
  "Inline": {
    "containerField": "children",
    "fields": {
      "bboxCenter": {
        "type": "SFVec3f",
        "accessType": "initializeOnly",
        "default": "0 0 0"
      },
      "bboxSize": {
        "type": "SFVec3f",
        "accessType": "initializeOnly",
        "default": "-1 -1 -1"
      },
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "load": {
        "type": "SFBool",
        "accessType": "inputOutput",
        "default": "true"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "url": {
        "type": "MFString",
        "accessType": "inputOutput"
      }
    }
  },
  "IntegerTrigger": {
    "containerField": "children",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "integerKey": {
        "type": "SFInt32",
        "accessType": "inputOutput",
        "default": "-1"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      }
    }
  },
  "Material": {
    "containerField": "material",
    "fields": {
      "ambientIntensity": {
        "type": "SFFloat",
        "accessType": "inputOutput",
        "default": "0.2"
      },
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "diffuseColor": {
        "type": "SFColor",
        "accessType": "inputOutput",
        "default": "0.8 0.8 0.8"
      },
      "emissiveColor": {
        "type": "SFColor",
        "accessType": "inputOutput",
        "default": "0 0 0"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "shininess": {
        "type": "SFFloat",
        "accessType": "inputOutput",
        "default": "0.2"
      },
      "specularColor": {
        "type": "SFColor",
        "accessType": "inputOutput",
        "default": "0 0 0"
      },
      "transparency": {
        "type": "SFFloat",
        "accessType": "inputOutput",
        "default": "0"
      }
    }
  },
  "MetadataBoolean": {
    "containerField": "metadata",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "name": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "reference": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "value": {
        "type": "MFBool",
        "accessType": "inputOutput"
      }
    }
  },
  "MetadataDouble": {
    "containerField": "metadata",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "name": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "reference": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "value": {
        "type": "MFDouble",
        "accessType": "inputOutput"
      }
    }
  },
  "MetadataFloat": {
    "containerField": "metadata",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "name": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "reference": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "value": {
        "type": "MFFloat",
        "accessType": "inputOutput"
      }
    }
  },
  "MetadataInteger": {
    "containerField": "metadata",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "name": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "reference": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "value": {
        "type": "MFInt32",
        "accessType": "inputOutput"
      }
    }
  },
  "MetadataSet": {
    "containerField": "metadata",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "name": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "reference": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "value": {
        "type": "MFNode",
        "accessType": "inputOutput"
      }
    }
  },
  "MetadataString": {
    "containerField": "metadata",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "name": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "reference": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "value": {
        "type": "MFString",
        "accessType": "inputOutput"
      }
    }
  },
  "OrientationInterpolator": {
    "containerField": "children",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "key": {
        "type": "MFFloat",
        "accessType": "inputOutput"
      },
      "keyValue": {
        "type": "MFRotation",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      }
    }
  },
  "ScalarInterpolator": {
    "containerField": "children",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "key": {
        "type": "MFFloat",
        "accessType": "inputOutput"
      },
      "keyValue": {
        "type": "MFFloat",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      }
    }
  },
  "Shape": {
    "containerField": "children",
    "fields": {
      "appearance": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "bboxCenter": {
        "type": "SFVec3f",
        "accessType": "initializeOnly",
        "default": "0 0 0"
      },
      "bboxSize": {
        "type": "SFVec3f",
        "accessType": "initializeOnly",
        "default": "-1 -1 -1"
      },
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "geometry": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      }
    }
  },
  "Sphere": {
    "containerField": "geometry",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "radius": {
        "type": "SFFloat",
        "accessType": "initializeOnly",
        "default": "1"
      },
      "solid": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "true"
      }
    }
  },
  "Switch": {
    "containerField": "children",
    "fields": {
      "bboxCenter": {
        "type": "SFVec3f",
        "accessType": "initializeOnly",
        "default": "0 0 0"
      },
      "bboxSize": {
        "type": "SFVec3f",
        "accessType": "initializeOnly",
        "default": "-1 -1 -1"
      },
      "children": {
        "type": "MFNode",
        "accessType": "inputOutput"
      },
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "whichChoice": {
        "type": "SFInt32",
        "accessType": "inputOutput",
        "default": "-1"
      }
    }
  },
  "Text": {
    "containerField": "geometry",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "fontStyle": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "length": {
        "type": "MFFloat",
        "accessType": "inputOutput"
      },
      "maxExtent": {
        "type": "SFFloat",
        "accessType": "inputOutput",
        "default": "0.0"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "solid": {
        "type": "SFBool",
        "accessType": "initializeOnly",
        "default": "false"
      },
      "string": {
        "type": "MFString",
        "accessType": "inputOutput"
      }
    }
  },
  "TimeSensor": {
    "containerField": "children",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "cycleInterval": {
        "type": "SFTime",
        "accessType": "inputOutput",
        "default": "1.0"
      },
      "enabled": {
        "type": "SFBool",
        "accessType": "inputOutput",
        "default": "true"
      },
      "loop": {
        "type": "SFBool",
        "accessType": "inputOutput",
        "default": "false"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "pauseTime": {
        "type": "SFTime",
        "accessType": "inputOutput",
        "default": "0"
      },
      "resumeTime": {
        "type": "SFTime",
        "accessType": "inputOutput",
        "default": "0"
      },
      "startTime": {
        "type": "SFTime",
        "accessType": "inputOutput",
        "default": "0"
      },
      "stopTime": {
        "type": "SFTime",
        "accessType": "inputOutput",
        "default": "0"
      }
    }
  },
  "TimeTrigger": {
    "containerField": "children",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      }
    }
  },
  "TouchSensor": {
    "containerField": "children",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "description": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "enabled": {
        "type": "SFBool",
        "accessType": "inputOutput",
        "default": "true"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      }
    }
  },
  "Transform": {
    "containerField": "children",
    "fields": {
      "bboxCenter": {
        "type": "SFVec3f",
        "accessType": "initializeOnly",
        "default": "0 0 0"
      },
      "bboxSize": {
        "type": "SFVec3f",
        "accessType": "initializeOnly",
        "default": "-1 -1 -1"
      },
      "center": {
        "type": "SFVec3f",
        "accessType": "inputOutput",
        "default": "0 0 0"
      },
      "children": {
        "type": "MFNode",
        "accessType": "inputOutput"
      },
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "rotation": {
        "type": "SFRotation",
        "accessType": "inputOutput",
        "default": "0 0 1 0"
      },
      "scale": {
        "type": "SFVec3f",
        "accessType": "inputOutput",
        "default": "1 1 1"
      },
      "scaleOrientation": {
        "type": "SFRotation",
        "accessType": "inputOutput",
        "default": "0 0 1 0"
      },
      "translation": {
        "type": "SFVec3f",
        "accessType": "inputOutput",
        "default": "0 0 0"
      }
    }
  },
  "Viewpoint": {
    "containerField": "children",
    "fields": {
      "centerOfRotation": {
        "type": "SFVec3f",
        "accessType": "inputOutput",
        "default": "0 0 0"
      },
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "description": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "fieldOfView": {
        "type": "SFFloat",
        "accessType": "inputOutput",
        "default": "0.7854"
      },
      "jump": {
        "type": "SFBool",
        "accessType": "inputOutput",
        "default": "true"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "orientation": {
        "type": "SFRotation",
        "accessType": "inputOutput",
        "default": "0 0 1 0"
      },
      "position": {
        "type": "SFVec3f",
        "accessType": "inputOutput",
        "default": "0 0 10"
      },
      "retainUserOffsets": {
        "type": "SFBool",
        "accessType": "inputOutput",
        "default": "false"
      }
    }
  },
  "WorldInfo": {
    "containerField": "children",
    "fields": {
      "class": {
        "type": "SFString",
        "accessType": "inputOutput"
      },
      "info": {
        "type": "MFString",
        "accessType": "inputOutput"
      },
      "metadata": {
        "type": "SFNode",
        "accessType": "inputOutput",
        "default": "NULL"
      },
      "title": {
        "type": "SFString",
        "accessType": "inputOutput"
      }
    }
  }
} as const;
export type CatalogNodeName = keyof typeof catalog;
