pragma solidity =0.5.16;

import '../DinoBEP20.sol';

contract BEP20 is DinoBEP20 {
    constructor(uint256 _totalSupply) public {
        _mint(msg.sender, _totalSupply);
    }
}
